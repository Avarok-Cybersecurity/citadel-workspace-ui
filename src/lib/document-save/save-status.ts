/**
 * Where a document's edits are, from the facts the session knows: whether AutoSave is on, the
 * link, how many of this tab's edits the server has not acknowledged, whether those are
 * written to this device, and whether copies kept here are locked. Pure: the title bar shows
 * it, beforeunload asks it.
 */
import type { LinkState } from '@/lib/cdoc/collab/ports';

/** How far this device's write of the held edits has got. */
export type LocalWrite = 'written' | 'writing' | 'failed';

export interface SaveInputs {
  readonly autoSave: boolean;
  readonly link: LinkState;
  /** This tab's edits the server has not acknowledged. */
  readonly unacknowledged: number;
  /** Save, AutoSave turned on or a share asked for edits to go while AutoSave is off. */
  readonly syncRequested: boolean;
  readonly local: LocalWrite;
  /** The server refused this session's writes (a revoked grant, an update over the limit). */
  readonly halted: boolean;
  /** Copies of the document this device keeps are sealed and cannot be opened here. */
  readonly locked: boolean;
}

export type SaveStatus =
  /** The server holds every edit. */
  | 'saved'
  /** Edits are on their way to the server. */
  | 'saving'
  /** Edits are due to go, and will once the link is back. */
  | 'offline'
  /** AutoSave is off: edits are kept on this device until a Save. */
  | 'savedToDevice'
  /** Edits not yet written to this device, or that the server will not take: closing loses or strands them. */
  | 'unsavedOnDevice'
  /** Copies kept on this device cannot be opened here: they are sealed and no key is to be had. */
  | 'locked';

export function saveStatus(inputs: SaveInputs): SaveStatus {
  if (inputs.unacknowledged > 0 && (inputs.local !== 'written' || inputs.halted)) return 'unsavedOnDevice';
  if (inputs.locked) return 'locked';
  if (inputs.unacknowledged === 0) return 'saved';
  if (inputs.autoSave || inputs.syncRequested) return inputs.link === 'up' ? 'saving' : 'offline';
  return 'savedToDevice';
}

/** Closing now would lose edits: some are neither acknowledged nor written to this device. */
export function warnsOnUnload(inputs: SaveInputs): boolean {
  return inputs.unacknowledged > 0 && inputs.local !== 'written';
}

/** Save has something to do: AutoSave is off, edits are held, and the server takes them. */
export function canSave(inputs: SaveInputs): boolean {
  return !inputs.autoSave && inputs.unacknowledged > 0 && !inputs.halted;
}
