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
