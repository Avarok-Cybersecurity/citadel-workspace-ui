/**
 * Telling the agent what this window has in front of the user, so its native
 * notices hold back what the user is already looking at (agent 0.8.6,
 * kernel/notices): the account, and the conversation if one is open.
 *
 * Sent when it changes -- the window gains or loses focus, is hidden, or opens
 * another conversation -- and only to an agent that hosts the account.
 */
export interface FocusDeps {
  hosts: () => Promise<boolean>;
  ownCid: () => Promise<bigint | null>;
  activePeer: () => bigint | null;
  /** The window is visible and has the keyboard. */
  inFront: () => boolean;
  send: (request: Record<string, unknown>) => Promise<void>;
}

export function createFocusReporter(deps: FocusDeps): () => Promise<void> {
  let last: string | null = null;
  return async (): Promise<void> => {
    if (!(await deps.hosts())) return;
    const cid: bigint | null = await deps.ownCid();
    if (cid === null) return;
    const focused: boolean = deps.inFront();
    const peer: bigint | null = focused ? deps.activePeer() : null;
    const said: string = `${cid}:${peer ?? '-'}:${focused}`;
    if (said === last) return;
    last = said;
    await deps.send({
      ConnectionManagement: {
        request_id: crypto.randomUUID(),
        management_command: { ReportFocus: { session_cid: cid, peer_cid: peer, focused } },
      },
    });
  };
}

/** The browser's answer to "is this window in front of the user?". */
export function windowInFront(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}
