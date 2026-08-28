/**
 * A permission belongs to a session, and this cache outlived every account.
 *
 * `PermissionsService` is a singleton whose cache is keyed by domain id alone.
 * `workspace-root` is the same id for every account, so after switching
 * accounts the previous account's rights answered — long enough to render a
 * control the new account may not use, or hide one it may.
 *
 * And a fetch that timed out left its `user:permissions:loaded` listener on the
 * global emitter for the tab's life: `off` was called only on the success path.
 * One per timed-out fetch, each holding its closure alive and each still
 * running on every subsequent load.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/test-utils/strip-comments';

const source: string = stripComments(
  readFileSync(join(process.cwd(), 'src/lib/permissions-service/service.ts'), 'utf-8'),
);

// The wait moved to its own module when service.ts crossed the line cap; the
// lifetime is its whole substance, so that is where these two assertions look.
const awaited: string = stripComments(
  readFileSync(
    join(process.cwd(), 'src/lib/permissions-service/await-permissions-loaded.ts'),
    'utf-8',
  ),
);

describe('the permissions cache', () => {
  it('is dropped when the session changes', () => {
    // Structural, because the alternative is standing up a singleton, a
    // workspace service and two sessions to observe one Map being emptied.
    const listener: string = source.slice(source.indexOf("'instance:cid-changed'"));
    const body: string = listener.slice(0, listener.indexOf('});'));

    expect(
      source,
      'nothing clears the cache on a session change, so the previous ' +
        "account's permissions answer for the next one",
    ).toContain("'instance:cid-changed'");
    expect(body).toContain('clearCache');
  });

  it('removes its listener when a fetch times out, not only when it succeeds', () => {
    const timeout: string = awaited.slice(awaited.indexOf('const timeout = setTimeout'));
    const body: string = timeout.slice(0, timeout.indexOf('}, TIMEOUT.PERMISSION_FETCH_MS)'));

    expect(
      body,
      'a timed-out fetch left its listener on the global emitter for the life ' +
        'of the tab, one per timeout',
    ).toContain("off('user:permissions:loaded'");
  });

  it('still removes it on success', () => {
    // The path that already worked. Fixing the timeout must not cost the one
    // that did not need fixing.
    expect(
      (awaited.match(/off\('user:permissions:loaded'/g) ?? []).length,
      'both the success and the timeout path must remove the handler',
    ).toBeGreaterThanOrEqual(2);
  });
});
