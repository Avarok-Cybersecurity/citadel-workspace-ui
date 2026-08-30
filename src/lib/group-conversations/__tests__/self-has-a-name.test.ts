/**
 * The creator's own username reaches `group:created`.
 *
 * CI showed `Group created: {name: , ownerId: ..., ownerUsername: }` on the
 * CREATOR's page. `group:created` falls back to `ownerUsername` for the label,
 * so a group the user had just named appeared in their own sidebar with no name
 * at all -- while the copy built from the invite, one line below, had a
 * perfectly good username in it.
 *
 * `resolveSelf` returned `tab?.selectedUsername ?? ''`. When the tab context
 * has no selection, an empty string is not a name; the tab's stored session
 * has one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selection: { current: { selectedUsername?: string } | null } = { current: null };
const storedSession: { current: { username: string } | null } = { current: null };
let sessionReads: number = 0;

// Partial mocks, spreading the real module. A bare object replaced the whole
// thing, and another module imports `reissueTabId` from tab-context -- which
// only breaks once the suite shares a module graph, so the file passed alone
// and failed together.
vi.mock('@/lib/tab-context', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, getSelectedUser: async (): Promise<unknown> => selection.current };
});
vi.mock('@/lib/connection', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    connectionManager: {
      getConnectionInfo: (): { cid: bigint } => ({ cid: 7n }),
      getTabSelectedSession: async (): Promise<unknown> => { sessionReads += 1; return storedSession.current; },
    },
  };
});

describe('who the creator is', () => {
  beforeEach(() => {
    selection.current = null;
    storedSession.current = null;
    sessionReads = 0;
    vi.resetModules();
  });

  it('falls back to the tab session when the selection has no username', async () => {
    storedSession.current = { username: 'ada' };
    const { resolveSelfForTest } = await import('../group-response-service');
    expect((await resolveSelfForTest())?.username).toBe('ada');
  });

  it('prefers the tab selection when it has one', async () => {
    // Positive control: the fallback must not outrank the authority.
    selection.current = { selectedUsername: 'grace' };
    storedSession.current = { username: 'ada' };
    const { resolveSelfForTest } = await import('../group-response-service');
    expect((await resolveSelfForTest())?.username).toBe('grace');
  });

  it('is empty only when neither knows', async () => {
    const { resolveSelfForTest } = await import('../group-response-service');
    expect((await resolveSelfForTest())?.username).toBe('');
  });

  it('reads the stored session once, not on every message', async () => {
    // `getTabSelectedSession` calls `getSelectedUser` again and then reads the
    // active session index, and this runs for EVERY websocket message. Round
    // 430 added it unmemoised, and `test:notifications` went from 18 minutes to
    // over 54 on the next run.
    storedSession.current = { username: 'ada' };
    const { resolveSelfForTest } = await import('../group-response-service');

    for (let i: number = 0; i < 25; i += 1) await resolveSelfForTest();

    expect(sessionReads).toBe(1);
  });
});
