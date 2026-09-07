import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Loading" must be derived from the domain, not stored in a flag.
 *
 * A stored flag is one render behind on a domain CHANGE. `activeDomainId`
 * becomes B while the flag is still false from A's completed load, and the
 * effect that would set it true does not run until after paint — so for one
 * frame the sidebar holds an empty list, believes nothing is loading, and says
 * "Nobody else is here yet".
 *
 * That window is exactly what `member-list-loading.spec.ts` was catching: after
 * the first fix it stopped failing all three retries and started failing its
 * FIRST attempt and passing on retry, which is what a one-frame race looks like
 * in a suite with retries. A shard reports green on a retry-pass, so the
 * remaining defect was invisible in the summary and only readable in the ✘/✓
 * markers.
 *
 * Comparing instead of storing closes it by construction. Pinned as source
 * because the property is the ABSENCE of a stored flag — a render test can show
 * the right output for the wrong reason, and would still pass against a flag
 * that happened to be set early enough on that run.
 */
const HOOK: string = readFileSync(
  join(process.cwd(), 'src', 'hooks', 'use-domain-members.ts'),
  'utf8',
);

describe('the member-list loading state', () => {
  it('is derived by comparing the loaded domain with the active one', () => {
    expect(HOOK).toMatch(/const isLoadingMembers:\s*boolean\s*=\s*activeDomainId !== null && loadedForDomain !== activeDomainId/);
  });

  it('is not stored in a flag that an effect flips', () => {
    // The floor and the point: a setter reintroduces the one-frame window.
    expect(HOOK).not.toMatch(/setIsLoadingMembers/);
  });

  it('records the domain an answer belongs to, not merely that one arrived', () => {
    // `setLoadedForDomain(activeDomainId)` and not `setLoadedForDomain(true)`:
    // an answer for domain A must not end the load for domain B.
    expect(HOOK).toMatch(/setLoadedForDomain\(activeDomainId\)/);
  });
});
