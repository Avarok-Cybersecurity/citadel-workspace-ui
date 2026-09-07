import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * With no domain selected, the sidebar must not say the room is empty.
 *
 * `activeDomainId` is `params.get("nodeId")`, so it is null before a node is
 * chosen and across a route change. With no domain, `isLoadingMembers`
 * initialises FALSE -- correctly, nothing is loading -- and `members` is empty,
 * so the empty-state branch fired and announced "Nobody else is here yet" about
 * a workspace it had never asked about.
 *
 * That is the rule `use-domain-members.ts` already states for NOT-LOADED
 * ("Not-yet-loaded is not empty"), which had been applied to the members array
 * and not to the absence of a domain to ask about.
 *
 * Read as source rather than rendered because the property is about a BRANCH
 * that must be guarded, and the state that reaches it is a transient null
 * during a route change -- reproducible in the Playwright spec
 * (member-list-loading.spec.ts) and awkward to hold still in a unit render.
 * This pins the guard so it cannot be dropped; that spec measures the effect.
 */
const SECTION: string = readFileSync(
  join(process.cwd(), 'src', 'components', 'layout', 'sidebar', 'MembersSection.tsx'),
  'utf8',
);
/** The branch chain itself, extracted when MembersSection reached 250 lines. */
const BODY: string = readFileSync(
  join(process.cwd(), 'src', 'components', 'layout', 'sidebar', 'MemberListBody.tsx'),
  'utf8',
);

describe('the sidebar with no domain selected', () => {
  it('reads the domain from the URL, which can be absent', () => {
    // Floor: if this stops being true the guard below is guarding nothing.
    expect(SECTION).toMatch(/const currentNodeId[^=]*=\s*params\.get\("nodeId"\)/);
    expect(SECTION).toMatch(/const activeDomainId[^=]*=\s*currentNodeId/);
  });

  it('passes the domain down, so the body can tell "not asked" from "empty"', () => {
    expect(SECTION).toMatch(/<MemberListBody[\s\S]{0,400}activeDomainId=\{activeDomainId\}/);
  });

  it('does not render the empty state when there is no domain', () => {
    // The guard must come BEFORE the members-length branch, or the empty state
    // renders first and the guard never runs.
    const guard: number = BODY.indexOf('activeDomainId === null');
    const empty: number = BODY.indexOf('<MembersEmptyState');
    expect(guard, 'no `activeDomainId === null` guard before the empty state').toBeGreaterThan(-1);
    expect(empty, 'MemberListBody no longer renders the empty state').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(empty);
  });
});
