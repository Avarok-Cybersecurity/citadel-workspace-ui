/**
 * The editor buffer must survive a re-render the user did not cause.
 *
 * `content` is the controlled value of the textarea, and BaseOffice's load
 * effect had no `isEditing` guard. It depended on `getInitialContent`, which was
 * a bare arrow — a new identity on every render of WorkspaceView, which
 * subscribes to the WHOLE workspace store. So a colleague's typing indicator, an
 * incoming message, or a member list arriving anywhere in the app replaced what
 * the user was typing and destroyed the native undo stack with it. On a
 * brand-new node the else branch ran and replaced their work with the default
 * template.
 *
 * Renders the REAL BaseOffice. Only the things it cannot run under jsdom are
 * mocked — MDX compilation and the workspace store — never the effect under
 * test.
 */
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialogProvider } from '@/components/shared/confirm-dialog';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@mdx-js/mdx', () => ({
  evaluate: async () => ({ default: () => null }),
}));
vi.mock('@/hooks/use-permission', () => ({
  usePermission: () => ({ allowed: true, reason: null }),
}));

let nodes: Record<string, { id: string; name: string; mdx_content: string }> = {};
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    state: { nodes, loading: { nodes: false }, currentUser: { id: 'u1' } },
    setState: () => {},
  }),
}));

import { BaseOffice } from '../BaseOffice';

describe('the MDX editor buffer', () => {
  it('is not replaced when an unrelated store update re-renders the page', async () => {
    nodes = { n1: { id: 'n1', name: 'Engineering', mdx_content: '# Saved body' } };
    const user = userEvent.setup();

    function Harness() {
      const [, bump] = useState(0);
      // Deliberately UNSTABLE — a new identity every render, exactly as
      // WorkspaceView's bare arrow was. This is what put the load effect back in
      // play on every unrelated store change; with a stable callback the effect
      // never re-runs and the guard is never exercised, so a test using
      // useCallback here passes with the guard fully removed. (It did.)
      const getInitialContent = () => '# Template';
      return (
        <>
          <button onClick={() => bump((n) => n + 1)}>unrelated update</button>
          <BaseOffice title="Engineering" getInitialContent={getInitialContent} nodeId="n1" />
        </>
      );
    }

    render(
      <ConfirmDialogProvider>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </ConfirmDialogProvider>
    );

    const edit = await screen.findByRole('button', { name: /edit/i });
    await user.click(edit);

    const textarea = await screen.findByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'work in progress');

    await user.click(screen.getByText('unrelated update'));

    expect(textarea).toHaveValue('work in progress');
  });

  it('the caller passes a stable callback and keys the editor per node', () => {
    const view: string = readFileSync(
      join(process.cwd(), 'src/components/workspace/WorkspaceView.tsx'),
      'utf8'
    );

    // Two separate defects the guard alone does not cover. Without useCallback
    // the load effect re-runs on every unrelated store change, so the guard is
    // the only thing standing between the user and losing their work — and it
    // does not help the moment they click Save and stop editing. Without the
    // key, React reuses the instance across nodes, so `isEditing` stays true
    // while the buffer is swapped to a different node's body.
    expect(view).toMatch(/const getInitialContent = useCallback\(/);
    expect(view).toMatch(/<BaseOffice[\s\S]{0,200}key=/);
  });
});
