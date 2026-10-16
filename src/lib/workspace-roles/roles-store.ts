/**
 * The workspace's role table, as this tab last heard it: the one source pickers, badges and
 * the role editor read.
 *
 * Filled by the answer to `Roles: List` and replaced by every `RoleChanged`, whether it answers
 * this tab's own edit or is the server's broadcast of someone else's, so a rename or a revoked
 * permission reaches every open picker without a re-read.
 *
 * "Asked" is not "answered": until the table arrives the state says `loading`, never an empty
 * table, so no screen renders "no roles" for a question still in flight. A failed list is kept
 * as a failure with the server's words; nothing retries on its own.
 */
import type { RolesResponse, WorkspaceRoles } from 'citadel-workspace-client-ts';
import { eventEmitter } from '@/lib/event-emitter';
import { notifyEach } from '@/lib/notify-listeners';

export type RolesState =
  | { status: 'unknown' }
  | { status: 'loading' }
  | { status: 'loaded'; table: WorkspaceRoles }
  | { status: 'failed'; reason: string };

interface RolesEvent { answer: RolesResponse }

const UNKNOWN: RolesState = { status: 'unknown' };

let state: RolesState = UNKNOWN;
/** Bumped by a session change, so an answer to the previous session's request is dropped. */
let generation: number = 0;
const listeners: Set<() => void> = new Set();

function set(next: RolesState): void {
  state = next;
  // One screen that throws must not leave the others showing the old table.
  notifyEach(listeners, 'role table');
}

export function getRolesState(): RolesState {
  return state;
}

export function subscribeRoles(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => { listeners.delete(listener); };
}

/** The table carried by a `Roles` response, whichever kind it is. */
export function tableOf(answer: RolesResponse): WorkspaceRoles {
  return 'Roles' in answer ? answer.Roles : answer.RoleChanged.roles;
}

/** Ask for the table. A no-op while a request is out or once it has arrived. */
export function requestRoles(list: () => Promise<WorkspaceRoles>): void {
  if (state.status === 'loading' || state.status === 'loaded') return;
  const asked: number = generation;
  set({ status: 'loading' });
  list().then(
    (table: WorkspaceRoles): void => { if (asked === generation) set({ status: 'loaded', table }); },
    (error: unknown): void => {
      // An answer that arrived another way (a broadcast) is not undone by this request failing.
      if (asked !== generation || state.status !== 'loading') return;
      set({ status: 'failed', reason: error instanceof Error && error.message ? error.message : 'The role table could not be read.' });
    },
  );
}

/** Forget the table: another session's is not this one's. */
export function resetRoles(): void {
  generation += 1;
  set(UNKNOWN);
}

eventEmitter.on('workspace:roles', (event: RolesEvent | undefined): void => {
  if (event?.answer) set({ status: 'loaded', table: tableOf(event.answer) });
});
eventEmitter.on('instance:cid-changed', resetRoles);
