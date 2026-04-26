import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for `postAuthSetup` — the single source of truth for the
 * `setConnectionId → loadWorkspace → listNodes → getTreeSchema` sequence
 * after authentication. The orphan-session redirect path used to roll its
 * own subset of these calls and missed `getTreeSchema`; centralising the
 * pattern means a unit test of `postAuthSetup` covers all callers.
 *
 * We mock `WorkspaceService` rather than exercising it for real because
 * its real impl depends on a live WebSocket session — out of scope for
 * a unit test, and exactly the kind of integration concern that should
 * be left to the Playwright integration suite.
 */

// Spies declared via `vi.hoisted` so they exist before `vi.mock` (which
// is itself hoisted) evaluates its factory.
const spies = vi.hoisted(() => {
  const calls: { name: string; args: unknown[] }[] = [];
  return {
    calls,
    setConnectionIdSpy: vi.fn((cid: bigint) => {
      calls.push({ name: 'setConnectionId', args: [cid] });
    }),
    loadWorkspaceSpy: vi.fn(async () => {
      calls.push({ name: 'loadWorkspace', args: [] });
    }),
    listNodesSpy: vi.fn(async () => {
      calls.push({ name: 'listNodes', args: [] });
    }),
    getTreeSchemaSpy: vi.fn(async () => {
      calls.push({ name: 'getTreeSchema', args: [] });
    }),
  };
});

vi.mock('@/lib/workspace-service', () => ({
  default: {
    setConnectionId: spies.setConnectionIdSpy,
    loadWorkspace: spies.loadWorkspaceSpy,
    listNodes: spies.listNodesSpy,
    getTreeSchema: spies.getTreeSchemaSpy,
  },
}));

import { postAuthSetup } from '../post-auth-setup';

describe('postAuthSetup', () => {
  beforeEach(() => {
    spies.calls.length = 0;
    spies.setConnectionIdSpy.mockClear();
    spies.loadWorkspaceSpy.mockClear();
    spies.listNodesSpy.mockClear();
    spies.getTreeSchemaSpy.mockClear();
  });

  it('runs the full sequence in order: setConnectionId → loadWorkspace → listNodes → getTreeSchema', async () => {
    const cid = 42n;
    await postAuthSetup(cid);

    expect(spies.calls.map(c => c.name)).toEqual([
      'setConnectionId',
      'loadWorkspace',
      'listNodes',
      'getTreeSchema',
    ]);
    expect(spies.setConnectionIdSpy).toHaveBeenCalledWith(cid);
  });

  it('skips getTreeSchema when skipTreeSchema option is set', async () => {
    await postAuthSetup(99n, { skipTreeSchema: true });
    expect(spies.calls.map(c => c.name)).toEqual([
      'setConnectionId',
      'loadWorkspace',
      'listNodes',
    ]);
    expect(spies.getTreeSchemaSpy).not.toHaveBeenCalled();
  });

  it('propagates errors from any step instead of silently swallowing them', async () => {
    spies.loadWorkspaceSpy.mockRejectedValueOnce(new Error('boom'));
    await expect(postAuthSetup(1n)).rejects.toThrow('boom');
    // setConnectionId ran (synchronous, before the failing step)
    expect(spies.setConnectionIdSpy).toHaveBeenCalled();
    // listNodes/getTreeSchema must NOT have run after the failure
    expect(spies.listNodesSpy).not.toHaveBeenCalled();
    expect(spies.getTreeSchemaSpy).not.toHaveBeenCalled();
  });
});
