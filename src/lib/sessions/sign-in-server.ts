/**
 * The server a Connect names. The agent signs in only the account with the typed
 * username on the server the Connect names, so the form must say which: the
 * server its way in is scoped to, else the one the agent's account of that name
 * is on. The agent's own list (GetAccountInformation's server_host) is the
 * authority, and its spelling is what is sent, so the agent compares like with like.
 */
import { sameAddress } from './same-server';

/** The agent's refusal codes for a Connect naming the wrong server (FailureReason). */
export type SignInServerReason = 'account_on_another_server' | 'no_such_account';

export type SignInServer =
  | { readonly kind: 'server'; readonly server: string }
  /** The agent's account of that name is on `server`, not on the one the form is scoped to. */
  | { readonly kind: 'elsewhere'; readonly server: string }
  | { readonly kind: 'none' };

export function signInServer(
  agent: readonly { username: string; server: string }[], username: string, scope: string | null,
): SignInServer {
  const account: { username: string; server: string } | undefined = agent.find((a) => a.username === username.trim());
  if (account === undefined) return { kind: 'none' };
  if (scope !== null && !sameAddress(account.server, scope)) return { kind: 'elsewhere', server: account.server };
  return { kind: 'server', server: account.server };
}

export const SIGN_IN_SERVER_COPY: Readonly<Record<SignInServerReason, (username: string) => string>> = {
  account_on_another_server: (username: string): string =>
    `${username} on this computer belongs to a different server. Choose that server, or sign in with an account on this one.`,
  no_such_account: (username: string): string =>
    `This computer has no account named ${username}. Check the spelling, or create the account first.`,
};

/** A sign-in refused because the account is not on the named server, or not on this computer. */
export class SignInServerRefusal extends Error {
  readonly reason: SignInServerReason;
  constructor(reason: SignInServerReason, username: string) {
    super(SIGN_IN_SERVER_COPY[reason](username.trim()));
    this.name = 'SignInServerRefusal';
    this.reason = reason;
  }
}

const REASONS: ReadonlySet<string> = new Set<string>(['account_on_another_server', 'no_such_account'] satisfies SignInServerReason[]);

export function signInServerReasonOf(code: string | null | undefined): SignInServerReason | null {
  return typeof code === 'string' && REASONS.has(code) ? (code as SignInServerReason) : null;
}

/** The server to name, or the typed refusal the form shows instead of sending. */
export function requireSignInServer(
  agent: readonly { username: string; server: string }[], username: string, scope: string | null,
): string {
  const found: SignInServer = signInServer(agent, username, scope);
  if (found.kind === 'server') return found.server;
  throw new SignInServerRefusal(found.kind === 'elsewhere' ? 'account_on_another_server' : 'no_such_account', username);
}
