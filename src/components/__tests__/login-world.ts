/**
 * The doubles a rendered sign-in form needs, shared by the sign-in form tests.
 * Each stands at an I/O seam (see signing-in-asks-for-what-the-policy-needs):
 * the agent behind the REAL AuthOperations, the authenticator, and the
 * IndexedDB / workspace / ILM work a signed-in session starts.
 *
 * vi.mock factories are hoisted and cannot close over imports, so each test
 * file's factory awaits this module and calls the matching function.
 */
import { vi } from 'vitest';
import type { World } from '@/lib/sign-in/__tests__/helpers';
import type { FakeAccount } from '@/lib/sign-in/__tests__/fake-agent';
import type { SignInFactors } from '@/lib/sign-in/types';
import type { Admission } from '@/lib/admission';
import type { SignedOutAccount } from '@/types/session-types';

export const loginWorld: {
  w: World; postAuth: ReturnType<typeof vi.fn>; messaging: ReturnType<typeof vi.fn>;
  /** What the control plane answers about the human check: null is "unknown" (no answer). */
  discovered: Admission | null;
  /** Its answer for a known workspace (`/admission/<slug>`), by server address; others get `discovered`. */
  discoveredByServer: Map<string, Admission>;
  /** The workspace the agent says each account is on (GetAccountInformation's server_host). */
  accountServers: Map<string, string>;
  /** Accounts the agent says the server signed out (GetSessions' signed_out). */
  signedOut: SignedOutAccount[];
} = {
  w: undefined as unknown as World, postAuth: vi.fn(), messaging: vi.fn(), discovered: null, discoveredByServer: new Map<string, Admission>(), accountServers: new Map<string, string>(), signedOut: [],
};

/** Discovery is a fetch to the control plane: answered here from `loginWorld.discovered`. */
export const admissionDouble = async (orig: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> => ({
  ...(await orig()),
  browserDiscoverAdmission: async (server: string | undefined): Promise<Admission | null> =>
    (server === undefined ? undefined : loginWorld.discoveredByServer.get(server)) ?? loginWorld.discovered,
  browserAccountServers: async (): Promise<ReadonlyMap<string, string>> => loginWorld.accountServers,
});

export async function websocketServiceDouble(): Promise<Record<string, unknown>> {
  const { AuthOperations } = await import('@/lib/websocket/auth-operations');
  const ops = (): InstanceType<typeof AuthOperations> => new AuthOperations({
    init: async (): Promise<void> => undefined,
    sendRequest: (request: unknown): Promise<void> => loginWorld.w.agent.send(request as Record<string, unknown>),
    claimSession: async (): Promise<unknown> => undefined, disconnect: async (): Promise<void> => undefined,
  });
  return {
    websocketService: {
      connect: (id: string, user: string, f: SignInFactors): Promise<void> => ops().connect(id, user, f),
      register: (id: string, user: string, pw: string, name: string, addr: string, token: string | null): Promise<void> =>
        ops().register(id, user, pw, name, addr, token),
      disconnect: (cid: bigint): Promise<void> => loginWorld.w.agent.send({ Disconnect: { request_id: 'bye', cid } }),
      sendRequest: (r: Record<string, unknown>): Promise<void> => loginWorld.w.agent.send(r),
    },
  };
}

export const connectionDouble = (): Record<string, unknown> => ({
  connectionManager: {
    getStoredSessions: (): { sessions: never[] } => ({ sessions: [] }),
    invalidateSessionCache: (): void => undefined,
    getActiveSessions: async (): Promise<Array<{ cid: bigint; username: string; server_address: string }>> =>
      loginWorld.w.agent.accounts.map((a: FakeAccount) => ({ cid: a.cid, username: a.username, server_address: 'bench.work.avarok.net' })),
    handleAuthSuccess: async (): Promise<void> => undefined,
    waitForReady: async (): Promise<void> => undefined,
    getActiveSessionsResult: async (): Promise<{ ok: true; sessions: never[]; signedOut: SignedOutAccount[] }> =>
      ({ ok: true, sessions: [], signedOut: loginWorld.signedOut }),
  },
});

export const passkeyDouble = async (orig: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> => ({
  ...(await orig()), passkeysAvailableHere: (): boolean => true,
  browserPasskeyDeps: (): unknown => ({ ...loginWorld.w.deps, now: (): number => 1 }),
});

export const signInDouble = async (orig: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> => ({
  ...(await orig()), browserSignInDeps: (): World['deps'] => loginWorld.w.deps,
});
