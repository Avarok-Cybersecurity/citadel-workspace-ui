/**
 * One failed permissions fetch must not disable a control for the life of the
 * page.
 *
 * `usePermission` asked once per domain and recorded that it had asked, in a
 * Set, BEFORE the request went out. The guard exists for a good reason. But
 * `fetchPermissionsForDomain` returns `null` on failure rather than throwing —
 * so one timed-out request during workspace start-up looked exactly like a
 * completed one, and nothing ever triggered a second attempt, because the
 * effect's dependencies only move when a fetch SUCCEEDS.
 *
 * CI caught it as the workspace admin waiting sixty seconds for their own Edit
 * button:
 *
 *   63 × locator resolved to <button disabled ...>Edit</button>
 *
 * An administrator who cannot edit, with no error and nothing to press, is
 * indistinguishable from a permissions bug in the server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePermission } from '../use-permission';
import { Permission } from '@/contexts/PermissionsContext';
import { eventEmitter } from '@/lib/event-emitter';

const state: {
  fetches: number;
  succeedFrom: number;
  permissions: Map<string, { permissions: Set<Permission> }>;
} = { fetches: 0, succeedFrom: Number.POSITIVE_INFINITY, permissions: new Map() };

vi.mock('@/contexts/PermissionsContext', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    usePermissions: (): unknown => ({
      permissions: state.permissions,
      loading: false,
      hasPermission: (domainId: string): boolean => state.permissions.has(domainId),
      getDeniedReason: (): string => 'not allowed',
      fetchPermissionsForDomain: async (domainId: string): Promise<unknown> => {
        state.fetches += 1;
        if (state.fetches >= state.succeedFrom) {
          // A new Map identity, as the real provider produces on success.
          state.permissions = new Map(state.permissions).set(domainId, {
            permissions: new Set([Permission.EditMdx]),
          });
          return { domainId };
        }
        return null;
      },
    }),
  };
});

beforeEach((): void => {
  state.fetches = 0;
  state.succeedFrom = Number.POSITIVE_INFINITY;
  state.permissions = new Map();
});
afterEach((): void => { vi.useRealTimers(); });

describe('a permissions fetch that comes back empty', () => {
  it('is tried again, and the control becomes usable when it lands', async (): Promise<void> => {
    state.succeedFrom = 2;

    const { result, rerender } = renderHook(() =>
      usePermission('office-1', Permission.EditMdx),
    );

    await waitFor((): void => { expect(state.fetches).toBeGreaterThanOrEqual(2); }, {
      timeout: 5_000,
    });
    rerender();
    await waitFor((): void => { expect(result.current.allowed).toBe(true); }, { timeout: 5_000 });
  }, 15_000);

  it('gives up rather than asking forever', async (): Promise<void> => {
    // Never succeeds. The budget is spent and then it stops -- a domain that
    // genuinely cannot be read should not be polled for the life of the page.
    renderHook(() => usePermission('office-2', Permission.EditMdx));

    await waitFor((): void => { expect(state.fetches).toBeGreaterThanOrEqual(4); }, {
      timeout: 8_000,
    });
    const settled: number = state.fetches;
    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
    expect(state.fetches).toBe(settled);
  }, 20_000);
});

describe('a retry budget that has run out', () => {
  it('starts again when the connection comes back', async (): Promise<void> => {
    // The budget is four attempts. Spending it while the connection was still
    // coming up refused the control for the life of the page — the workspace
    // admin's Edit button, permanently disabled, explaining itself as a denial
    // rather than as an answer that never arrived.
    const { result, rerender } = renderHook(() => usePermission('office-1', Permission.EditMdx));

    await waitFor((): void => { expect(state.fetches).toBeGreaterThanOrEqual(4); }, {
      timeout: 10_000,
    });
    const spent: number = state.fetches;
    // Nothing more happens on its own: the budget is spent.
    await new Promise((resolve): void => { setTimeout(resolve, 200); });
    expect(state.fetches).toBe(spent);
    expect(result.current.allowed).toBe(false);

    state.succeedFrom = spent + 1;
    eventEmitter.emit('on-ws-connection-success', {});

    // The budget starts over: the request goes out again on its own.
    await waitFor((): void => { expect(state.fetches).toBeGreaterThan(spent); }, { timeout: 10_000 });
    // The real provider re-renders consumers by replacing its Map; the mocked
    // one holds a plain object, so the render is driven here (as in the test
    // above) rather than being what is under test.
    rerender();
    expect(result.current.allowed).toBe(true);
  }, 30_000);
});

describe('what a control says when the answer never came', () => {
  it('reports an unanswered check, not a denial', async (): Promise<void> => {
    // "Permissions have not been loaded for this domain" describes the cache.
    // Under a control that looks refused, the user reads it as "you may not do
    // this" -- and CI read it the same way for sixty seconds under the
    // workspace admin's own Edit button.
    const { result } = renderHook(() => usePermission('office-1', Permission.EditMdx));

    await waitFor((): void => { expect(state.fetches).toBeGreaterThanOrEqual(4); }, {
      timeout: 10_000,
    });
    await waitFor((): void => {
      expect(result.current.reason).toMatch(/could not be checked/i);
    }, { timeout: 10_000 });
    expect(result.current.reason).not.toMatch(/have not been loaded/i);
  }, 30_000);

  it('still reports a real denial as a denial', async (): Promise<void> => {
    // The budget is not spent, so this is the answer rather than the silence.
    const { result } = renderHook(() => usePermission('office-1', Permission.EditMdx));
    expect(result.current.reason).toBe('not allowed');
  });
});
