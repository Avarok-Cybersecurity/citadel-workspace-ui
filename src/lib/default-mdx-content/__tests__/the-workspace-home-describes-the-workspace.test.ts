/**
 * The workspace home describes this workspace, not the editor.
 *
 * Measured live: every tenant's home page was the "MDX Editor Showcase" -- a
 * tutorial on Markdown syntax, titled "Welcome to Your Workspace" -- with its
 * Edit button disabled because nothing stores it. It said nothing about the
 * workspace a person had just joined.
 */
import { describe, it, expect } from 'vitest';
import { getWorkspaceHomeContent } from '../workspace-home-content';

describe('the workspace home', () => {
  it('names the workspace and lists its top-level spaces', () => {
    const page: string = getWorkspaceHomeContent('Harbor', 'Ships and shipping', [
      { name: 'Engineering', description: 'Builds things' },
      { name: 'Sales', description: '' },
    ]);
    expect(page).toMatch(/^# Harbor$/m);
    expect(page).toContain('Ships and shipping');
    expect(page).toMatch(/\*\*Engineering\*\* — Builds things/);
    expect(page).toMatch(/\*\*Sales\*\*$/m);
    expect(page).not.toMatch(/Showcase|\*\*text\*\*/);
  });

  it('says what to do when there is nothing in it yet', () => {
    expect(getWorkspaceHomeContent('Harbor', '', [])).toMatch(/no spaces yet/i);
  });

  it('escapes names, which MDX would otherwise run as code', () => {
    const page: string = getWorkspaceHomeContent('R&D {beta}', '', [{ name: '<Lab>', description: '{x}' }]);
    expect(page).toContain('# R&D \\{beta\\}');
    expect(page).toContain('**\\<Lab\\>** — \\{x\\}');
    expect(page).not.toMatch(/(^|[^\\])[{<]/);
  });
});

describe("a new page's default text", () => {
  it("describes the node's own level, not an office or a room", async () => {
    const { getDefaultNodeContent, getDefaultChildNodeContent } = await import('../node-content');
    const division: string = getDefaultNodeContent('Research', { level: 'division', childLevels: 'teams', parentLevel: null });
    expect(division).toContain('This is a division in your workspace');
    expect(division).toContain('This division can hold **teams**');
    const team: string = getDefaultChildNodeContent('Ops', undefined, { level: 'team', childLevels: '', parentLevel: 'division' });
    expect(team).toContain('inherits access from the division above it');
    expect(`${division}\n${team}`).not.toMatch(/\b(offices?|rooms?)\b/i);
  });
});
