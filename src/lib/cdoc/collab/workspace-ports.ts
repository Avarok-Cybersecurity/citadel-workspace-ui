/**
 * The ports a DocumentSession takes in the app: this tab's workspace session, the browser's
 * clock, and the member roster for names and colours. The editor opener is the caller's (the
 * page view owns the worker). No local cache yet: every open pulls the document.
 */
import WorkspaceService from '@/lib/workspace-service';
import { rosterPeerName, rosterPeerUsername } from '@/lib/roster-peer-name';
import { usernameAvatarColor } from '@/lib/avatar-color';
import type { HexColor } from '../editor/model-values';
import { workspaceDocumentsTransport } from './documents-transport';
import type { EditorOpener } from '../editor/controller';
import type { Clock, DocumentSessionPorts, PeerIdentity } from './ports';

export const browserClock: Clock = {
  now: (): number => performance.now(),
  after: (ms: number, fn: () => void): (() => void) => {
    const handle: ReturnType<typeof setTimeout> = setTimeout(fn, ms);
    return (): void => clearTimeout(handle);
  },
};

export const rosterIdentity: PeerIdentity = (cid: bigint): { readonly name: string; readonly color: HexColor } => ({
  name: rosterPeerName(cid),
  color: hexColor(usernameAvatarColor(rosterPeerUsername(cid))),
});

export function workspaceCollabPorts(openEditor: EditorOpener): DocumentSessionPorts {
  return { transport: workspaceDocumentsTransport(WorkspaceService), clock: browserClock, cache: null, openEditor, identify: rosterIdentity };
}

/** A `clientSeqBase` no other session instance will draw: a random 32-bit prefix. */
export function randomClientSeqBase(): bigint {
  const prefix: Uint32Array = crypto.getRandomValues(new Uint32Array(1));
  return BigInt(prefix[0]) << 32n;
}

function hexColor(value: string): HexColor {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`not a hex colour: ${value}`);
  return value as HexColor;
}
