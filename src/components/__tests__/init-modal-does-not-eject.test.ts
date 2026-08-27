/**
 * Dismissing the workspace-initialization prompt must not eject the user.
 *
 * The prompt asks for the operator's WORKSPACE_MASTER_PASSWORD, which no
 * ordinary member has any way to obtain — and it is shown to EVERY user until
 * somebody completes it, because the root workspace is seeded at boot with
 * empty metadata and only this modal ever sets `initialized: true`.
 *
 * So the only action available to most users was Cancel, and Cancel did
 * `window.location.assign('/')` — throwing them out of the workspace they had
 * just successfully joined. Nothing about the workspace actually required
 * initialization: it is seeded at boot, and Admin is granted at connect to the
 * first member.
 *
 * Asserted on the source because the eject is a navigation side effect in a
 * handler that a render test cannot reach without standing up the whole
 * workspace event tree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const handler = readFileSync(
  join(process.cwd(), 'src/components/WorkspaceEventHandler.tsx'),
  'utf8'
);

/**
 * The dismiss handler's CODE, with comments stripped.
 *
 * The first version of this test matched the string inside the comment that
 * explains the removal — so it failed against the fixed code. A source
 * assertion has to read code, not prose about code; the same trap in the other
 * direction is a `toContain` that passes because the word appears in a comment.
 */
const dismissBody = handler
  .slice(
    handler.indexOf('const handleInitCancelled'),
    handler.indexOf('};', handler.indexOf('const handleInitCancelled'))
  )
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('dismissing the initialization prompt', () => {
  it('does not navigate the user away', () => {
    expect(dismissBody).not.toMatch(/window\.location\.(assign|replace|href)/);
  });

  it('still records the dismissal, so it does not reappear all session', () => {
    expect(dismissBody).toMatch(/sessionStorage\.setItem\('workspace-init-modal-dismissed'/);
  });

  it('tells the user what the password is and that they can skip', () => {
    const modal = readFileSync(
      join(process.cwd(), 'src/components/WorkspaceInitializationModal.tsx'),
      'utf8'
    );

    // A prompt whose only escape used to be an eject must at minimum say that
    // skipping is safe, and that this is not the user's own password.
    expect(modal).toMatch(/master password/i);
    expect(modal).toMatch(/Not now/);
  });
});
