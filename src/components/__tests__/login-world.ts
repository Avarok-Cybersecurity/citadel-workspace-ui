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

export const loginWorld: { w: World; postAuth: ReturnType<typeof vi.fn>; messaging: ReturnType<typeof vi.fn> } = {
  w: undefined as unknown as World, postAuth: vi.fn(), messaging: vi.fn(),
};

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
  },
});

export const passkeyDouble = async (orig: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> => ({
  ...(await orig()), passkeysAvailableHere: (): boolean => true,
  browserPasskeyDeps: (): unknown => ({ ...loginWorld.w.deps, now: (): number => 1 }),
});

export const signInDouble = async (orig: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> => ({
  ...(await orig()), browserSignInDeps: (): World['deps'] => loginWorld.w.deps,
});
