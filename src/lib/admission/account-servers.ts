/**
 * Which workspace server each of the agent's accounts is on, from its answer to
 * `GetAccountInformation` (every account): the host the user typed when it
 * registered (`server_host`).
 *
 * A sign-in names an account, not a workspace, but a human check's token is
 * bound to the workspace it is for (Turnstile `cData`, the tenant's slug, which
 * the server requires). So the sign-in form looks the account's workspace up
 * here. An account the agent recorded no host for maps to nothing: its check
 * renders unbound, and the server refuses it with a retry message.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One of the agent's accounts and the host it registered on. */
export interface AccountHost { username: string; server: string }

/**
 * Every account with its host, or null when the message is not this request's answer.
 * A list, not a map: the same username on two workspaces is two accounts.
 */
export function readAccountHosts(message: unknown, requestId: string): AccountHost[] | null {
  const unwrapped: unknown = isRecord(message) && isRecord(message.Response) ? message.Response : message;
  if (!isRecord(unwrapped)) return null;
  const body: unknown = unwrapped.GetAccountInformationResponse;
  if (!isRecord(body) || body.request_id !== requestId) return null;
  const accounts: unknown = body.accounts;
  const entries: unknown[] = accounts instanceof Map ? [...accounts.values()] : isRecord(accounts) ? Object.values(accounts) : [];
  const hosts: AccountHost[] = [];
  for (const account of entries) {
    if (!isRecord(account) || typeof account.username !== 'string') continue;
    const host: unknown = account.server_host;
    if (typeof host === 'string' && host.trim().length > 0) hosts.push({ username: account.username, server: host.trim() });
  }
  return hosts;
}

/** username -> server host, or null when the message is not this request's answer. */
export function readAccountServers(message: unknown, requestId: string): ReadonlyMap<string, string> | null {
  const hosts: AccountHost[] | null = readAccountHosts(message, requestId);
  return hosts === null ? null : new Map<string, string>(hosts.map((h: AccountHost): [string, string] => [h.username, h.server]));
}
