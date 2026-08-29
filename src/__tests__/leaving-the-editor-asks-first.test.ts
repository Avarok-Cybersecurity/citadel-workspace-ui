/**
 * Every way out of the editor asks before discarding the buffer.
 *
 * `beforeunload` covers closing the tab and nothing else. In-app navigation
 * unmounts the editor — `BaseOffice` is keyed by node — so the buffer goes with
 * it, silently. The check was added at one navigation source, the sidebar's
 * node select, and four others leave just as completely: clicking a member (the
 * workspace view renders P2P chat instead), opening a group, opening the file
 * manager (which deletes `nodeId` from the URL), and switching sessions.
 *
 * Twenty minutes of writing, one stray click.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/test-utils/strip-comments';

const SRC: string = join(process.cwd(), 'src');

/**
 * Navigation sources that unmount the document editor.
 *
 * Listed rather than derived: "does this navigation unmount BaseOffice" is not
 * a textual property, and a scan that guessed would either miss one or flag
 * every navigate() in the app.
 */
const LEAVES_THE_EDITOR: string[] = [
  'components/layout/sidebar/HierarchySidebar.tsx',
  'components/layout/sidebar/MembersSection.tsx',
  'components/layout/sidebar/FilesSection.tsx',
  'components/layout/sidebar/useWorkspaceSwitcher.tsx',
];

describe('a navigation that unmounts the editor', () => {
  it('asks before discarding unsaved work', () => {
    const offenders: string[] = LEAVES_THE_EDITOR.filter(
      (rel) => !/mayLeaveEditor\s*\(/.test(stripComments(readFileSync(join(SRC, rel), 'utf-8'))),
    );

    expect(
      offenders,
      'this navigation unmounts the document editor without asking, so the ' +
        'buffer is discarded silently. Call mayLeaveEditor(confirm) first.',
    ).toEqual([]);
  });

  it('asks only when something is actually dirty', async () => {
    // A prompt on every navigation would be trained away within a day, and the
    // one that matters would go with it.
    const { mayLeaveEditor } = await import('@/lib/leave-editor');
    const { registerUnsavedEdits, clearUnsavedEditsForTests } = await import('@/lib/unsaved-edits');

    clearUnsavedEditsForTests();

    let asked: number = 0;
    const confirm = async (): Promise<boolean> => {
      asked += 1;
      return true;
    };

    expect(await mayLeaveEditor(confirm)).toBe(true);
    expect(asked, 'a clean editor must not prompt').toBe(0);

    const clear = registerUnsavedEdits('doc-1');
    expect(await mayLeaveEditor(confirm)).toBe(true);
    expect(asked, 'a dirty editor must prompt').toBe(1);

    clear();
    expect(await mayLeaveEditor(confirm)).toBe(true);
    expect(asked, 'clearing must stop the prompting').toBe(1);
  });

  it('blocks the navigation when the user says no', async () => {
    const { mayLeaveEditor } = await import('@/lib/leave-editor');
    const { registerUnsavedEdits, clearUnsavedEditsForTests } = await import('@/lib/unsaved-edits');

    clearUnsavedEditsForTests();
    registerUnsavedEdits('doc-2');

    expect(await mayLeaveEditor(async () => false)).toBe(false);
  });
});
