/**
 * The page's replica, opened and kept by a DocumentSession: what DocsCanvas's `keepReplica`
 * does in the app. DocsCanvas supplies its runtime's opener and a `show` for each replica to
 * draw; the session decides when to open (over the snapshot its Pull returns) and when to
 * re-open (over a newer one after a long disconnect), and the keeper owns every replica's
 * lifetime: the session disposes a replaced one, the teardown disposes the last.
 *
 * R1_COLLABORATION is the one production configuration, every value explicit (PCND).
 */
import type { EditorController, EditorOpener, EditorOrigin } from '../editor/controller';
import { DocumentSession } from './document-session';
import type { DocumentSessionConfig, DocumentSessionPorts } from './ports';
import { CDOC_CRDT_DOC_VERSION, DOCUMENTS_RELAY_LIMITS } from './relay-limits';
import type { DocumentSessionError } from './session-errors';
import { randomClientSeqBase, workspaceCollabPorts } from './workspace-ports';
import { WRITE_RESPONSE_TIMEOUT_MS } from '@/lib/workspace-service/await-write-response';

export const R1_COLLABORATION: Omit<DocumentSessionConfig, 'nodeId' | 'clientSeqBase'> = {
  docVersion: CDOC_CRDT_DOC_VERSION,
  limits: DOCUMENTS_RELAY_LIMITS,
  // Only on the server's compaction hint (snapshot_min_updates): one policy, the kernel's.
  snapshotAfterLocalUpdates: null,
  // Owner decision for R1: a peer offline with unsent edits is invisible to "alone", so no gc
  // until the kernel tracks each client's acknowledged seq.
  gcBeforeSnapshot: 'never',
  // A Pull is a request like any other workspace write: the same patience.
  pullTimeoutMs: WRITE_RESPONSE_TIMEOUT_MS,
  // Three heartbeats per expiry: one lost record does not make a present peer vanish.
  awarenessHeartbeatMs: 5_000,
  peerExpiryMs: 15_000,
  // One caret per tab of an account; more is a session drawing carets it does not have.
  maxCaretsPerSession: 8,
};

/** DocsCanvas's ReplicaKeeper, for any replica type the runtime's opener returns. */
export type Keeper<E extends EditorController> = (open: (from: EditorOrigin) => Promise<E>, show: (editor: E) => void, fail: (error: unknown) => void) => () => void;

export function replicaKeeper<E extends EditorController>(
  config: DocumentSessionConfig,
  portsFor: (open: EditorOpener) => DocumentSessionPorts,
  onProblem: (problem: DocumentSessionError) => void,
): Keeper<E> {
  return (open: (from: EditorOrigin) => Promise<E>, show: (editor: E) => void, fail: (error: unknown) => void): (() => void) => {
    const opened: E[] = [];
    const tracked = async (from: EditorOrigin): Promise<E> => {
      const editor: E = await open(from);
      opened.push(editor);
      return editor;
    };
    let session: DocumentSession;
    try {
      session = new DocumentSession(config, portsFor(tracked));
    } catch (error: unknown) {
      fail(error);
      return (): void => {};
    }
    session.on('editor', (editor: EditorController): void => {
      const index: number = opened.findIndex((e: E): boolean => e === editor);
      if (index < 0) return;
      // The ones before it were replaced, and the session has disposed them.
      opened.splice(0, index);
      show(opened[0]);
    });
    session.on('problem', onProblem);
    void session.open();
    return (): void => {
      session.close();
      for (const editor of opened.splice(0)) editor.dispose();
    };
  };
}

/** The app's keeper for `nodeId`: this tab's workspace session, the R1 configuration. */
export function workspaceReplicaKeeper<E extends EditorController>(nodeId: string, onProblem: (problem: DocumentSessionError) => void): Keeper<E> {
  return replicaKeeper<E>({ ...R1_COLLABORATION, nodeId, clientSeqBase: randomClientSeqBase() }, workspaceCollabPorts, onProblem);
}
