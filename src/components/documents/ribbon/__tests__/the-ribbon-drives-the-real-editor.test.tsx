/**
 * The ribbon against the real engine, no doubles: DocumentHost over the in-process cdoc runtime
 * opens an EditorSession, DocsCanvas provides it, and ribbon commands change the document the
 * engine lays out. The FakeEditor suites pin each control's exact command; this one proves the
 * commands land.
 */
import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { inProcessRuntime } from '@/lib/cdoc/__tests__/wasm-rig';
import type { CdocRuntime } from '@/lib/cdoc/runtime';
import { DocumentHost, type DocumentHostProps } from '../../DocumentHost';
import { keepBlankReplica } from '../../blank-replica';

const BLANK: DocumentHostProps = {
  nodeId: 'plan-1',
  appId: 'docs',
  title: 'Quarterly plan',
  permissions: { edit: { enabled: true, reason: null } },
  documentSource: { kind: 'blank' },
  loadCdocRuntime: (): Promise<CdocRuntime> => Promise.resolve(inProcessRuntime('main-thread')),
  // Any signed-in name: this is about commands reaching the engine, not who signs.
  commentAuthor: 'Ada',
  // A document nobody shares: the commands, not the collaboration, are under test here.
  keepReplica: keepBlankReplica,
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

  it('reads the caret from the engine: Bold turns pressed, and the size grows from the style’s own', async () => {
    render(<DocumentHost {...BLANK} />);
    const user: UserEvent = userEvent.setup();
    const bold: HTMLElement = await screen.findByTestId('ribbon-mark-bold', {}, { timeout: 10_000 });
    expect(bold).toHaveAttribute('aria-pressed', 'mixed');
    await user.click(bold);
    await waitFor((): void => expect(bold).toHaveAttribute('aria-pressed', 'true'), { timeout: 10_000 });
    const size: HTMLElement = screen.getByTestId('ribbon-font-size');
    const before: string = (size as HTMLSelectElement).value;
    expect(before).not.toBe('');
    await user.click(screen.getByTestId('ribbon-grow-font'));
    await waitFor((): void => expect(Number((size as HTMLSelectElement).value)).toBeGreaterThan(Number(before)), { timeout: 10_000 });
    expect(screen.getByTestId('docs-ribbon-status')).toHaveTextContent(/^$/);
  }, 30_000);

  it('takes a page setup: landscape, then Narrow margins, with nothing refused', async () => {
    render(<DocumentHost {...BLANK} />);
    const user: UserEvent = userEvent.setup();
    await user.click(await screen.findByTestId('docs-ribbon-tab-layout', {}, { timeout: 10_000 }));
    await user.click(screen.getByTestId('ribbon-page-orientation-open'));
    await user.click(await screen.findByTestId('ribbon-page-orientation-landscape'));
    await user.click(screen.getByTestId('ribbon-page-margins-open'));
    await user.click(await screen.findByTestId('ribbon-page-margins-narrow'));
    // Focus goes back to the document once the command has settled, accepted or refused.
    await waitFor((): void => expect(screen.getByTestId('editor-input')).toHaveFocus(), { timeout: 10_000 });
    await act(async (): Promise<void> => { await Promise.resolve(); });
    expect(screen.getByTestId('docs-ribbon-status')).toHaveTextContent(/^$/);
  }, 30_000);
});
