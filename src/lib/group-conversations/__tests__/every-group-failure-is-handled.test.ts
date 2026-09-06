import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { GROUP_FAILURE_VARIANTS } from '../group-events';

/**
 * The failure arm's list must be exactly the failures the wire can carry.
 *
 * `group-events.ts` maps every `Group*Failure` to one `group:failed` event, and
 * the comment above that loop says, correctly, that "mapping them individually
 * is how the next one comes to be forgotten". It was then a hand-maintained
 * list — and it had drifted in BOTH directions at once: it named
 * `GroupJoinFailure` and `GroupDisconnectFailure`, neither of which exists in
 * the wire types, and omitted five that do.
 *
 * The expensive omission was `GroupRespondRequestFailure`. Accepting an
 * invitation commits the group locally first (`use-group-state-invite.ts`), so
 * when the server refused — a stale key, a group that ended, a responder who is
 * not the owner — no arm matched, no `group:failed` fired, and the user kept a
 * group in their sidebar the server never counted them into, typing into a
 * channel nobody would receive. That is the exact outcome `group-events.ts`'s
 * own header describes as the bug it was written to fix, for a different
 * variant.
 *
 * Both directions are asserted, and neither is sufficient alone. "Every real
 * variant is listed" passes for a list that also contains fiction — which is
 * what shipped. "Every listed name is real" passes for a list of one.
 *
 * The generated types are the source of truth rather than the Rust enum: they
 * are what the browser actually receives, and they live in the submodule this
 * package already depends on.
 */
/**
 * Found through Node's own resolution, not a hardcoded `../`.
 *
 * The package is an npm workspace member, so it resolves from wherever the app
 * itself resolves it — the parent checkout in CI, and nowhere in a standalone
 * worktree of this submodule, which is the honest answer in that case rather
 * than a path that happens to work.
 */
function generatedTypesDir(): string | null {
  try {
    const req: NodeRequire = createRequire(import.meta.url);
    const manifest: string = req.resolve('citadel-internal-service-wasm-client/package.json');
    return join(dirname(manifest), 'src', 'types');
  } catch {
    return null;
  }
}

/**
 * Throws rather than returning `[]` when the package cannot be resolved.
 *
 * An empty list would make "lists every real variant" pass vacuously — nothing
 * is missing from nothing — while "lists nothing fictional" failed with all
 * eleven names in the diff. One assertion silently satisfied and the other
 * loudly wrong, for the same cause. Now all three say the same true thing.
 */
function generatedFailureVariants(): string[] {
  const dir: string | null = generatedTypesDir();
  if (dir === null || !existsSync(dir)) {
    throw new Error(
      'citadel-internal-service-wasm-client did not resolve, so the generated types could not ' +
        'be read and nothing here was checked. It resolves wherever the app does; in a ' +
        'standalone worktree of this submodule it does not, and CI checks out the parent.',
    );
  }
  return readdirSync(dir)
    .filter((f) => /^Group\w*Failure\.ts$/.test(f))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
}

describe('the group failure arm', () => {
  it('can see the generated types at all', () => {
    // Floor. Every assertion below compares against this directory; if it moved,
    // they would all pass over an empty list and report the arm as complete.
    const dir: string | null = generatedTypesDir();
    expect(
      dir,
      'citadel-internal-service-wasm-client did not resolve, so this test examined nothing. ' +
        'It resolves wherever the app does; in a standalone worktree of this submodule it ' +
        'does not, and CI checks out the parent.',
    ).not.toBeNull();
    expect(generatedFailureVariants().length).toBeGreaterThan(5);
  });

  it('lists every failure variant the wire can carry', () => {
    const missing: string[] = generatedFailureVariants().filter(
      (v) => !GROUP_FAILURE_VARIANTS.includes(v),
    );
    expect(
      missing,
      'these failures arrive and no arm matches them, so nothing tells the user the ' +
        'operation was refused — and an optimistically-applied local change is never undone',
    ).toEqual([]);
  });

  it('lists nothing the wire cannot carry', () => {
    const generated: string[] = generatedFailureVariants();
    const fictional: string[] = GROUP_FAILURE_VARIANTS.filter((v) => !generated.includes(v));
    expect(
      fictional,
      'these names exist in no generated type, so they are dead branches that read as coverage',
    ).toEqual([]);
  });
});
