/**
 * What an account link does once parsed: switch to a session this browser's
 * agent already holds, or open sign-in with the username filled in.
 *
 * Nothing else. The link carries no secret, so it can never authenticate by
 * itself: the only session it can reach is one the agent reports as live, and
 * that goes through the same switch the Active Sessions strip uses -- claim
 * refusal ("open in another tab") included. Every other outcome, an unanswered
 * session query among them, is the sign-in form waiting for a password.
 *
 * I/O arrives through `AccountLinkIO` so the decision can be tested without a
 * connection manager.
 */
import { normalizeWorkspaceAddress } from '@/lib/workspace-address';
import type { AccountLink } from './account-link';

/** The fields of a live session the decision reads. */
export interface LinkableSession {
  username: string;
  server_address: string;
}

export type AccountLinkDecision<T extends LinkableSession> =
  | { readonly kind: 'switch'; readonly session: T }
  | { readonly kind: 'login'; readonly username: string };

export interface AccountLinkIO<T extends LinkableSession> {
  /** `ok: false` when the agent never answered -- not the same as "none". */
  listSessions: () => Promise<{ ok: boolean; sessions: readonly T[] }>;
  switchTo: (session: T) => Promise<void>;
  login: (username: string) => void;
}

function sameServer(a: string, b: string): boolean {
  return normalizeWorkspaceAddress(a).toLowerCase() === normalizeWorkspaceAddress(b).toLowerCase();
}

/**
 * The one session the link names, or sign-in.
 *
 * Two live sessions with the link's username and no server to tell them apart
 * is not a match: choosing one would be a guess about which account the user
 * meant.
 */
export function decideAccountLink<T extends LinkableSession>(
  link: AccountLink,
  sessions: readonly T[],
): AccountLinkDecision<T> {
  const matches: T[] = sessions.filter(
    (session: T) =>
      session.username === link.username &&
      (link.server === undefined || sameServer(link.server, session.server_address)),
  );
  const only: T | undefined = matches.length === 1 ? matches[0] : undefined;
  return only ? { kind: 'switch', session: only } : { kind: 'login', username: link.username };
}

export async function openAccountLink<T extends LinkableSession>(
  link: AccountLink,
  io: AccountLinkIO<T>,
): Promise<AccountLinkDecision<T>> {
  const { ok, sessions } = await io.listSessions();
  const decision: AccountLinkDecision<T> = decideAccountLink(link, ok ? sessions : []);
  if (decision.kind === 'switch') await io.switchTo(decision.session);
  else io.login(decision.username);
  return decision;
}
