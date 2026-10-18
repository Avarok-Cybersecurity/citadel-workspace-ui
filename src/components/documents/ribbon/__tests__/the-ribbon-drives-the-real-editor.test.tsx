/**
 * The ribbon against the real engine, no doubles: DocumentHost over the in-process cdoc runtime
 * opens an EditorSession, DocsCanvas provides it, and ribbon commands change the document the
 * engine lays out. The FakeEditor suites pin each control's exact command; this one proves the
 * commands land.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { inProcessRuntime } from '@/lib/cdoc/__tests__/wasm-rig';
import type { CdocRuntime } from '@/lib/cdoc/runtime';
import { DocumentHost, type DocumentHostProps } from '../../DocumentHost';

const BLANK: DocumentHostProps = {
  nodeId: 'plan-1',
  appId: 'docs',
  title: 'Quarterly plan',
  permissions: { edit: { enabled: true, reason: null } },
  documentSource: { kind: 'blank' },
  loadCdocRuntime: (): Promise<CdocRuntime> => Promise.resolve(inProcessRuntime('main-thread')),
  // Any signed-in name: this is about commands reaching the engine, not who signs.
  commentAuthor: 'Ada',
};

describe('the ribbon over the real editor', () => {
  it('appears once the editor opens, and a page break from Insert adds a page; Undo takes it back', async () => {
    render(<DocumentHost {...BLANK} />);
    const user: UserEvent = userEvent.setup();
    const bar: HTMLElement = screen.getByTestId('document-status-bar');
    await within(bar).findByText('Page 1 of 1', {}, { timeout: 10_000 });
    await user.click(await screen.findByTestId('docs-ribbon-tab-insert', {}, { timeout: 10_000 }));
    await user.click(screen.getByTestId('ribbon-insert-break-page'));
    await waitFor((): void => expect(within(bar).getByText('Page 1 of 2')).toBeInTheDocument(), { timeout: 10_000 });
    await user.click(screen.getByTestId('docs-ribbon-tab-home'));
    await user.click(screen.getByTestId('ribbon-undo'));
    await waitFor((): void => expect(within(bar).getByText('Page 1 of 1')).toBeInTheDocument(), { timeout: 10_000 });
  }, 30_000);

  it('shows what the engine refuses: removing a link where there is none', async () => {
    render(<DocumentHost {...BLANK} />);
    const user: UserEvent = userEvent.setup();
    await user.click(await screen.findByTestId('docs-ribbon-tab-insert', {}, { timeout: 10_000 }));
    await user.click(screen.getByTestId('ribbon-remove-link'));
    await waitFor((): void => expect(screen.getByTestId('docs-ribbon-status')).toHaveTextContent(/^Could not remove the link\. .+/), { timeout: 10_000 });
  }, 30_000);
});
