import type { AgentReconnectEvent } from '@/types/agent-reconnect';
import { accountLinkPath } from '@/lib/onboarding/account-link';
import { createValueStore, type ValueStore } from '@/lib/value-store';

/**
 * What this tab does when the agent reports on its link to the workspace server.
 *
 * A server deploy drops every client's connection. The agent now reconnects on
 * its own and says so; the page used to learn of it only as a burst of failed
 * requests. While the agent retries, the tab says "Reconnecting to <server>…";
 * when it is back, the P2P links the drop took down are brought up again; when
 * the agent gives up, the user is sent to sign in to that same account.
 *
 * Only this tab's own session counts. The notifications are routed by cid, but a
 * leader tab also sees ones no live tab claims, and acting on those would put
 * another account's banner on this one — so a cid that is not ours is ignored.
 */

/** The workspace server this tab is waiting on, or null when it is not waiting. */
export const reconnectingTo: ValueStore<string | null> = createValueStore<string | null>('reconnecting-to', null);

export interface OwnSession {
  cid: bigint;
  username: string;
  server: string;
}

export interface ServerReconnectIO {
  ownSession: () => Promise<OwnSession | null>;
  setReconnecting: (server: string | null) => void;
  /** Bring this session's P2P links back up after the server link returned. */
  resumePeers: () => Promise<void>;
  /** Leave for sign-in at `path`, telling the user why in `message`. */
  signInAgain: (path: string, message: string) => void;
}

export function reconnectingMessage(server: string): string {
  return `Reconnecting to ${server}…`;
}

function signInMessage(server: string, reason: string | null): string {
  const why: string = reason === null || reason.trim() === '' ? '' : ` (${reason.trim()})`;
  return `Couldn't reconnect to ${server}${why}. Sign in again to continue.`;
}

export async function handleServerReconnectEvent(event: AgentReconnectEvent, io: ServerReconnectIO): Promise<void> {
  const own: OwnSession | null = await io.ownSession();
  if (!own || own.cid !== event.cid) return;

  if (event.kind === 'lost' && event.reconnecting) {
    io.setReconnecting(own.server);
    return;
  }

  io.setReconnecting(null);
  if (event.kind === 'reconnected') {
    await io.resumePeers();
    return;
  }

  // Failed, or lost with the agent not retrying at all: either way this
  // session is gone and only signing in again brings it back.
  const reason: string | null = event.kind === 'failed' ? event.reason : null;
  io.signInAgain(accountLinkPath({ username: own.username, server: own.server }), signInMessage(own.server, reason));
}
