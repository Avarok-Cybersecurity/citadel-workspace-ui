/**
 * A scripted stand-in for the tenant control plane, speaking its HTTP contract.
 *
 * WHY A FAKE: the real control plane is being built concurrently and does not
 * exist to be called. This answers at the FETCH boundary rather than replacing
 * the client, so every test that uses it still runs the real request building,
 * response parsing and error mapping in control-plane-client.ts.
 *
 * The contract, as agreed:
 *   GET  /api/slug/:slug                      -> { available, reason? }
 *   POST /api/tenants                         -> free { claim_code, workspace_host } | paid { checkout_url }
 *   GET  /api/tenants/:slug/status?session_id -> { status, claim_code?, workspace_host? }
 *   POST /api/tenants/:slug/portal { claim_code, accepted_customer_terms_version? } -> { portal_url }
 *                                             | 409 { error: 'customer-terms-stale', current }
 *   GET  /api/billing/policy                  -> billing/policy.json's shape (POLICY_BODY)
 *   POST /api/tenants/:slug/usage { claim_code } -> { period, overage_billing, dimensions, billing }
 *   POST /api/tenants/:slug/overage { claim_code, enabled } -> { overage_billing }
 *   errors: { error } with 4xx/5xx; 503 = not configured.
 */
import type { FetchLike } from '../control-plane-client';

export interface Scripted {
  readonly status: number;
  readonly body: unknown;
}

export interface ContractFake {
  readonly fetch: FetchLike;
  readonly requests: Array<{ method: string; path: string; body: unknown }>;
  /** Slugs that answer `{ available: false, reason }`. */
  readonly unavailable: Map<string, string>;
  /** Replies to POST /api/tenants, consumed in order; the last one repeats. */
  readonly createReplies: Scripted[];
  /** Replies to GET status, consumed in order; the last one repeats. */
  readonly statusReplies: Scripted[];
  /** Replies to POST portal, consumed in order; the last one repeats. */
  readonly portalReplies: Scripted[];
  /** Replies to GET billing policy; the last one repeats. */
  readonly policyReplies: Scripted[];
  /** Replies to POST usage; the last one repeats. */
  readonly usageReplies: Scripted[];
  /** Replies to POST overage; the last one repeats. */
  readonly overageReplies: Scripted[];
}

function reply({ status, body }: Scripted): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function next(queue: Scripted[]): Scripted {
  const head: Scripted | undefined = queue.length > 1 ? queue.shift() : queue[0];
  if (!head) throw new Error('contract fake: no reply scripted');
  return head;
}

export function contractFake(): ContractFake {
  const fake: ContractFake = {
    requests: [],
    unavailable: new Map(),
    createReplies: [],
    statusReplies: [],
    portalReplies: [],
    policyReplies: [],
    usageReplies: [],
    overageReplies: [],
    fetch: async (input: string, init?: RequestInit): Promise<Response> => {
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const url: URL = new URL(input, 'https://work.avarok.net');
      const method: string = init?.method ?? 'GET';
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      fake.requests.push({ method, path: `${url.pathname}${url.search}`, body });

      const slugMatch: RegExpMatchArray | null = url.pathname.match(/^\/api\/slug\/([^/]+)$/);
      if (method === 'GET' && slugMatch) {
        const reason: string | undefined = fake.unavailable.get(decodeURIComponent(slugMatch[1]));
        return reply({ status: 200, body: reason ? { available: false, reason } : { available: true } });
      }
      if (method === 'POST' && url.pathname === '/api/tenants') return reply(next(fake.createReplies));
      if (method === 'GET' && /^\/api\/tenants\/[^/]+\/status$/.test(url.pathname)) return reply(next(fake.statusReplies));
      if (method === 'POST' && /^\/api\/tenants\/[^/]+\/portal$/.test(url.pathname)) return reply(next(fake.portalReplies));
      if (method === 'GET' && url.pathname === '/api/billing/policy') return reply(next(fake.policyReplies));
      if (method === 'POST' && /^\/api\/tenants\/[^/]+\/usage$/.test(url.pathname)) return reply(next(fake.usageReplies));
      if (method === 'POST' && /^\/api\/tenants\/[^/]+\/overage$/.test(url.pathname)) return reply(next(fake.overageReplies));
      return reply({ status: 404, body: { error: 'not found' } });
    },
  };
  return fake;
}
