/**
 * The storage half of "a read failure is not an empty tree".
 *
 * `readFile` caught every error and returned null. `loadTree` turned that into
 * "no tree", and the service persisted a default over files still on disk.
 *
 * The service-level tests for this stub the IO layer, so they never execute
 * this code -- reverting `readFile` left them green. These tests drive
 * `RevfsOpfsStorage` against a fake OPFS instead, so both halves of the fix
 * have a control that can fail.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevfsOpfsStorage } from '@/lib/revfs/opfs-storage';

const KEY = 'alice:bob';

/** An OPFS whose file read fails in whichever way the test names. */
function opfsThrowing(error: unknown): void {
  const dir = {
    getDirectoryHandle: vi.fn(async () => dir),
    getFileHandle: vi.fn(async () => {
      throw error;
    }),
  };
  vi.stubGlobal('navigator', {
    storage: { getDirectory: vi.fn(async () => dir) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage tells absent from unreadable', () => {
  it('reports null when the tree file is genuinely absent', async () => {
    // The control. A first run must still read as "no tree", or nobody can
    // ever start and the fix would have broken the common path.
    opfsThrowing(new DOMException('no such file', 'NotFoundError'));

    await expect(new RevfsOpfsStorage().loadTree(KEY)).resolves.toBeNull();
  });

  it('throws when storage failed to answer, rather than reporting no tree', async () => {
    // The defect: this returned null, and the caller wrote a default over a
    // tree that was still there.
    opfsThrowing(new DOMException('could not read', 'NotReadableError'));

    await expect(new RevfsOpfsStorage().loadTree(KEY)).rejects.toThrow();
  });

  it('throws on a non-DOMException failure too', async () => {
    // The catch-all case: whatever the platform throws, only NotFoundError
    // means "absent".
    opfsThrowing(new TypeError('handle revoked'));

    await expect(new RevfsOpfsStorage().loadTree(KEY)).rejects.toThrow();
  });
});
