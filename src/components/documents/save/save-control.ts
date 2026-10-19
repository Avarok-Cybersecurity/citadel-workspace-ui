/**
 * The handle the title bar's save controls hold for one open document: where its edits are
 * (null until the session is open) and the two things a person can do, Save and AutoSave.
 * Made eagerly with the editing arm; the session (lib/cdoc/collab, loaded with the editor)
 * binds to it once opened, so this module carries only types from collab.
 */
import { createValueStore, type ValueStore } from '@/lib/value-store';
import type { DocumentSession } from '@/lib/cdoc/collab/document-session';
import type { SaveInputs } from '@/lib/document-save/save-status';

export interface SaveControl {
  readonly inputs: ValueStore<SaveInputs | null>;
  save(): Promise<void>;
  setAutoSave(on: boolean): Promise<void>;
}

export interface BindableSaveControl extends SaveControl {
  /** The session is open; the returned function says it closed. */
  bind(session: DocumentSession): () => void;
}

export function saveControl(nodeId: string): BindableSaveControl {
  const inputs: ValueStore<SaveInputs | null> = createValueStore<SaveInputs | null>(`document-save:${nodeId}`, null);
  let session: DocumentSession | null = null;
  const live = (): DocumentSession => {
    if (session === null) throw new Error('the document is not open, so there is nothing to save');
    return session;
  };
  return {
    inputs,
    save: (): Promise<void> => live().save(),
    setAutoSave: (on: boolean): Promise<void> => live().setAutoSave(on),
    bind: (opened: DocumentSession): (() => void) => {
      session = opened;
      inputs.set(opened.saveInputs);
      const stop: () => void = opened.on('save', (next: SaveInputs): void => inputs.set(next));
      return (): void => {
        stop();
        if (session !== opened) return;
        session = null;
        inputs.set(null);
      };
    },
  };
}
