/**
 * A Citadel Docs document open for real-time collaboration: one editor replica kept in step
 * with its node's log on the workspace server (the kernel's Documents sub-protocol), with the
 * other people in it drawn on its pages.
 *
 * The session never decides what the bytes mean: updates, snapshots and awareness records are
 * the editor's, and the server orders, stores and relays them. What it owns is ordering (pull
 * in sequence, close every gap, never apply an update twice), delivery (every local update is
 * appended until acknowledged, again after a reconnect), and reporting: every refusal, format
 * mismatch and denied permission is emitted as a `problem`, never dropped.
 */
import type { DocumentsResponse } from 'citadel-workspace-client-ts';
import type { EditorController } from '../editor/controller';
import type { PeerPresence } from '../editor/peer-overlay';
import { DocumentPresence } from './document-presence';
import { DocumentSync } from './document-sync';
import type { DocumentSessionConfig, DocumentSessionPorts, LinkState } from './ports';
import { SerialQueue } from './serial-queue';
import { DocumentSessionError, type DocumentSessionProblem } from './session-errors';

export interface DocumentSessionEvents {
  /** A replica was opened: the first, or a re-open over a newer snapshot. Draw this one. */
  editor: EditorController;
  problem: DocumentSessionError;
  peers: readonly PeerPresence[];
}

type Listeners = { [E in keyof DocumentSessionEvents]: Set<(payload: DocumentSessionEvents[E]) => void> };

export class DocumentSession {
  private readonly queue: SerialQueue;
  private readonly sync: DocumentSync;
  private readonly presence: DocumentPresence;
  private readonly listeners: Listeners = { editor: new Set(), problem: new Set(), peers: new Set() };
  private readonly unsubscribe: (() => void)[] = [];
  private unbindEditor: (() => void) | null = null;
  private link: LinkState = 'up';
  private closed: boolean = false;

  constructor(private readonly config: DocumentSessionConfig, private readonly ports: DocumentSessionPorts) {
    const report = (problem: DocumentSessionProblem): void => this.emit('problem', new DocumentSessionError(problem));
    this.queue = new SerialQueue((cause: unknown): void => report({ kind: 'editorFailed', operation: 'run a session step', cause }));
    const linkUp = (): boolean => this.link === 'up' && !this.closed;
    this.sync = new DocumentSync(config, ports, {
      report,
      linkUp,
      adopt: (editor: EditorController): void => this.adopt(editor),
      alone: (): boolean => this.presence.alone(),
    });
    this.presence = new DocumentPresence(config, ports, this.queue, {
      report,
      linkUp,
      editor: (): EditorController | null => this.sync.editor,
      publish: (peers: readonly PeerPresence[]): void => this.emit('peers', peers),
    });
  }

  /** Subscribes first, then pulls: a push that lands mid-open is queued behind the pull. */
  open(): Promise<void> {
    const { transport } = this.ports;
    this.unsubscribe.push(
      transport.onResponse((response: DocumentsResponse): void => this.received(response)),
      transport.onError((message: string): void => {
        if (message.startsWith('Permission denied')) void this.queue.run(async (): Promise<void> => this.sync.onPermissionDenied(message));
      }),
      transport.onLink((state: LinkState): void => this.linkChanged(state)),
    );
    return this.queue.run((): Promise<void> => this.sync.start());
  }

  get editor(): EditorController | null {
    return this.sync.editor;
  }

  /** The last log seq the replica holds, in order. */
  get seq(): bigint {
    return this.sync.seq;
  }

  /** Every queued step has run (for callers that must wait for the replica to settle). */
  settled(): Promise<void> {
    return this.queue.idle();
  }

  on<E extends keyof DocumentSessionEvents>(event: E, listener: (payload: DocumentSessionEvents[E]) => void): () => void {
    const set: Set<(payload: DocumentSessionEvents[E]) => void> = this.listeners[event];
    set.add(listener);
    return (): void => { set.delete(listener); };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const stop of this.unsubscribe.splice(0)) stop();
    this.presence.stop();
    this.sync.stop();
    if (this.unbindEditor) this.unbindEditor();
    this.unbindEditor = null;
  }

  private received(response: DocumentsResponse): void {
    if (this.closed || !concernsNode(response, this.config.nodeId)) return;
    if ('DocumentAwareness' in response) {
      void this.presence.heard(response.DocumentAwareness.from_cid, response.DocumentAwareness.payload);
      return;
    }
    if ('AwarenessRelayed' in response) return;
    void this.queue.run((): Promise<void> => this.sync.onResponse(response));
  }

  private linkChanged(state: LinkState): void {
    if (this.closed || state === this.link) return;
    this.link = state;
    if (state === 'down') {
      this.sync.onLinkDown();
      return;
    }
    void this.queue.run((): Promise<void> => this.sync.onLinkUp());
    this.presence.moved();
  }

  private adopt(editor: EditorController): void {
    if (this.unbindEditor) this.unbindEditor();
    const bindings: (() => void)[] = [
      editor.on('change', ({ update }: { readonly update: Uint8Array }): void => { void this.queue.run((): Promise<void> => this.sync.local(update)); }),
      editor.on('selection', (): void => this.presence.moved()),
      editor.on('pages', (): void => { void this.presence.repainted(); }),
    ];
    this.unbindEditor = (): void => { for (const unbind of bindings) unbind(); };
    this.emit('editor', editor);
    this.presence.moved();
  }

  private emit<E extends keyof DocumentSessionEvents>(event: E, payload: DocumentSessionEvents[E]): void {
    for (const listener of [...this.listeners[event]]) listener(payload);
  }
}

/** Whether a Documents response is about `nodeId`; a refusal naming no node is every session's. */
export function concernsNode(response: DocumentsResponse, nodeId: string): boolean {
  const body: unknown = Object.values(response)[0];
  if ('Refused' in response) {
    const refusal: unknown = response.Refused;
    if (typeof refusal === 'string') return true;
    const detail: unknown = Object.values(refusal as Record<string, unknown>)[0];
    return !isRecord(detail) || detail.node_id === nodeId;
  }
  return isRecord(body) && body.node_id === nodeId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
