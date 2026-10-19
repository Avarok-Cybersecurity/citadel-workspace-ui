/**
 * Where a document's edits are, from four facts the session knows: whether AutoSave is on,
 * the link, how many of this tab's edits the server has not acknowledged, and whether those
 * are written to this device. Pure: the title bar shows it, beforeunload asks it.
 */
import type { LinkState } from './ports';

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
  | 'unsavedOnDevice';

export function saveStatus(inputs: SaveInputs): SaveStatus {
  if (inputs.unacknowledged === 0) return 'saved';
  if (inputs.local !== 'written' || inputs.halted) return 'unsavedOnDevice';
  if (inputs.autoSave || inputs.syncRequested) return inputs.link === 'up' ? 'saving' : 'offline';
  return 'savedToDevice';
}

/** Closing now would lose edits: some are neither acknowledged nor written to this device. */
export function warnsOnUnload(inputs: SaveInputs): boolean {
  return inputs.unacknowledged > 0 && inputs.local !== 'written';
}
