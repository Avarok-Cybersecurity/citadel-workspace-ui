/**
 * A peer group's live document, kept in sync member to member (the owner's choice: "mesh for
 * groups"). The editor's document is bridged to this member's kept copy (group-doc-keeper),
 * which is what exchanges updates with the other members and stores them, open or not.
 *
 * - On connect: whatever either side has is given to the other, then the other members are
 *   asked for what this member lacks.
 * - Then every change crosses the bridge once: MESH_ORIGIN marks a change the bridge made, so it
 *   is never carried back.
 *
 * Presence (who else is editing, their cursors) stays local for now, as in the office relay.
 */
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { eventEmitter } from '@/lib/event-emitter';
import type { CollabProvider } from '@/lib/collab/collab-provider';
import type { GroupDocKeeper } from './group-doc-keeper';

export const MESH_ORIGIN: symbol = Symbol('group-mesh');

export class GroupMeshProvider implements CollabProvider {
  readonly awareness: Awareness;
  private destroyed: boolean = false;
  private kept: Y.Doc | null = null;
  private readonly fromKept = (update: Uint8Array, origin: unknown): void => {
    if (origin !== MESH_ORIGIN) Y.applyUpdate(this.editorDoc, update, MESH_ORIGIN);
  };
  private readonly fromEditor = (update: Uint8Array, origin: unknown): void => {
    if (origin !== MESH_ORIGIN && this.kept) Y.applyUpdate(this.kept, update, MESH_ORIGIN);
  };

  constructor(
    private readonly editorDoc: Y.Doc,
    private readonly keeper: GroupDocKeeper,
    private readonly groupId: string,
    private readonly docId: string,
    /** Told why the other members could not be asked for the document. */
    private readonly reportFailure: (reason: string) => void,
  ) {
    this.awareness = new Awareness(editorDoc);
    const _: Promise<void> = this.connect();
  }

  private async connect(): Promise<void> {
    const kept: Y.Doc = await this.keeper.doc(this.groupId, this.docId);
    if (this.destroyed) return;
    this.kept = kept;
    Y.applyUpdate(this.editorDoc, Y.encodeStateAsUpdate(kept), MESH_ORIGIN);
    // Anything typed before the copy loaded.
    Y.applyUpdate(kept, Y.encodeStateAsUpdate(this.editorDoc), MESH_ORIGIN);
    kept.on('update', this.fromKept);
    this.editorDoc.on('update', this.fromEditor);
    eventEmitter.emit('yjs:sync-complete', { documentId: this.docId });
    try {
      await this.keeper.requestSync(this.groupId, this.docId);
    } catch (error) {
      this.reportFailure(error instanceof Error ? error.message : String(error));
    }
  }

  setLocalState(state: Record<string, unknown>): void { this.awareness.setLocalState(state); }
  setLocalStateField(field: string, value: unknown): void { this.awareness.setLocalStateField(field, value); }
  getStates(): ReturnType<Awareness['getStates']> { return this.awareness.getStates(); }

  destroy(): void {
    this.destroyed = true;
    this.kept?.off('update', this.fromKept);
    this.editorDoc.off('update', this.fromEditor);
    this.awareness.destroy();
  }
}
