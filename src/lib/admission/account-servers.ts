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

/** username -> server host, or null when the message is not this request's answer. */
export function readAccountServers(message: unknown, requestId: string): ReadonlyMap<string, string> | null {
  const unwrapped: unknown = isRecord(message) && isRecord(message.Response) ? message.Response : message;
  if (!isRecord(unwrapped)) return null;
  const body: unknown = unwrapped.GetAccountInformationResponse;
  if (!isRecord(body) || body.request_id !== requestId) return null;
  const accounts: unknown = body.accounts;
  const entries: unknown[] = accounts instanceof Map ? [...accounts.values()] : isRecord(accounts) ? Object.values(accounts) : [];
  const servers: Map<string, string> = new Map<string, string>();
  for (const account of entries) {
    if (!isRecord(account) || typeof account.username !== 'string') continue;
    const host: unknown = account.server_host;
    if (typeof host === 'string' && host.trim().length > 0) servers.set(account.username, host.trim());
  }
  return servers;
}
