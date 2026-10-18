/**
 * The control plane's wire: one request, its JSON answer, and what a refusal
 * becomes. Split from control-plane-client.ts so the client stays a list of
 * routes; the client re-exports what callers need from here.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * A request the control plane refused, or could not be asked.
 *
 * `status` is the HTTP status, or 0 when no response arrived at all (offline,
 * DNS, CSP). 503 is the control plane saying it is not configured yet, which is
 * a state of the deployment rather than of the request, so it gets its own flag
 * and its own wording. `code` is the control plane's machine-readable reason
 * (`not-owner`, `no-subscription`, ...), or undefined when it gave none.
 * `reply` is the refusal's whole body, for the few refusals that carry more
 * than a code (`customer-terms-stale` names the current version); undefined
 * when there was no object to keep.
 */
export class ControlPlaneError extends Error {
  readonly status: number;
  readonly notConfigured: boolean;
  readonly code: string | undefined;
  readonly reply: Readonly<Record<string, unknown>> | undefined;

  constructor(status: number, message: string, code: string | undefined, reply?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'ControlPlaneError';
    this.status = status;
    this.code = code;
    this.reply = reply;
    this.notConfigured = status === 503;
  }

  /** Worth asking again: nothing answered, or the server failed rather than refused. */
  get transient(): boolean {
    return this.status === 0 || (this.status >= 500 && !this.notConfigured);
  }
}

const NOT_CONFIGURED: string =
  'Creating a workspace is not available yet. Please try again later.';
const UNREACHABLE: string =
  'Could not reach Citadel. Check your connection and try again.';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value: unknown = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function malformed(what: string): ControlPlaneError {
  return new ControlPlaneError(502, `Citadel sent an unexpected reply (${what}). Please try again.`, undefined);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function send(fetchFn: FetchLike, url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchFn(url, { ...init, headers: { Accept: 'application/json', ...init.headers } });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ControlPlaneError(0, UNREACHABLE, undefined);
  }
  const body: unknown = await readJson(response);
  if (!response.ok) {
    // The control plane answers `{ error: <code>, detail: <sentence> }`: the
    // sentence is for the visitor, the code for logs and for callers that word
    // a refusal themselves.
    const reply: Record<string, unknown> | undefined = isRecord(body) ? body : undefined;
    const code: string | undefined = reply ? optionalString(reply, 'error') : undefined;
    if (response.status === 503) throw new ControlPlaneError(503, NOT_CONFIGURED, code, reply);
    const stated: string | undefined = reply ? optionalString(reply, 'detail') ?? code : undefined;
    throw new ControlPlaneError(response.status, stated ?? `Request failed (${response.status}).`, code, reply);
  }
  if (!isRecord(body)) throw malformed('not an object');
  return body;
}

/** A JSON POST: the body carries what must never be in a URL (claim codes). */
export function postJson(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
