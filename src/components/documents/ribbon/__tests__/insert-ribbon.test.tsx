/**
 * Insert and Layout: table grid, link, comment, footnote, breaks, symbol, and Layout's fields;
 * each sends exactly its command with the arguments the form produced.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CaretFormatting } from '@/lib/cdoc/editor/controller';
import { FakeEditor } from './fake-editor';
import { FIXED_ENVIRONMENT, MAY_EDIT, renderRibbon } from './render-ribbon';

/** A paragraph the engine reports with no direct spacing or indent, so Layout's fields can be set. */
const PLAIN: CaretFormatting = { known: true, run: {}, paragraph: {} };

function setUp(commentAuthor: string | null): { editor: FakeEditor; user: UserEvent } {
  const editor: FakeEditor = new FakeEditor(PLAIN);
  renderRibbon({ editor, edit: MAY_EDIT, commentAuthor });
  return { editor, user: userEvent.setup() };
}

async function openTab(user: UserEvent, tab: 'insert' | 'layout'): Promise<void> {
  await user.click(screen.getByTestId(`docs-ribbon-tab-${tab}`));
}

describe('the Insert ribbon', () => {
  it('inserts the table the grid sizes, by pointer and by keyboard', async () => {
    const { editor, user } = setUp('Ada');
    await openTab(user, 'insert');
    await user.click(screen.getByTestId('ribbon-insert-table'));
    await user.click(await screen.findByTestId('ribbon-table-cell-3-4'));
    await user.click(screen.getByTestId('ribbon-insert-table'));
    await screen.findByTestId('ribbon-table-cell-1-1');
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}');
    expect(screen.getByTestId('ribbon-table-size')).toHaveTextContent('3 × 2 table');
    await user.keyboard('{Enter}');
    await waitFor((): void => expect(editor.sent).toEqual([
      { name: 'insertTable', rows: 3, cols: 4 },
      { name: 'insertTable', rows: 2, cols: 3 },
    ]));
  });

  it('links to a normalised web address, and refuses a script one', async () => {
    const { editor, user } = setUp('Ada');
    await openTab(user, 'insert');
    await user.click(screen.getByTestId('ribbon-insert-link'));
    await user.type(await screen.findByTestId('ribbon-link-address'), 'javascript:alert(1)');
    await user.click(screen.getByTestId('ribbon-insert-link-submit'));
    expect(screen.getByTestId('ribbon-insert-link-invalid')).toHaveTextContent('not javascript: ones');
    expect(editor.sent).toEqual([]);
    await user.clear(screen.getByTestId('ribbon-link-address'));
    await user.type(screen.getByTestId('ribbon-link-address'), 'example.com/plan');
    await user.click(screen.getByTestId('ribbon-insert-link-submit'));
    await waitFor((): void => expect(editor.sent).toEqual([{ name: 'insertLink', href: 'https://example.com/plan' }]));
    await waitFor((): void => expect(editor.focused).toBeGreaterThan(0));
  });

  it('removes a link', async () => {
    const { editor, user } = setUp('Ada');
    await openTab(user, 'insert');
    await user.click(screen.getByTestId('ribbon-remove-link'));
    await waitFor((): void => expect(editor.sent).toEqual([{ name: 'removeLink' }]));
  });

  it('keeps a written comment when the dialog is dismissed, and drops it only on Discard', async () => {
    const { editor, user } = setUp('Ada');
    await openTab(user, 'insert');
    await user.click(screen.getByTestId('ribbon-insert-comment'));
    await user.type(await screen.findByTestId('ribbon-comment-text'), 'Half a thought');
    await user.keyboard('{Escape}');
    await waitFor((): void => expect(screen.queryByTestId('ribbon-insert-comment-dialog')).toBeNull());
    await user.click(screen.getByTestId('ribbon-insert-comment'));
    expect(await screen.findByTestId('ribbon-comment-text')).toHaveValue('Half a thought');
    await user.click(screen.getByTestId('ribbon-insert-comment-cancel'));
    await user.click(screen.getByTestId('ribbon-insert-comment'));
    expect(await screen.findByTestId('ribbon-comment-text')).toHaveValue('');
    expect(editor.sent).toEqual([]);
  });

  it('ties a refused address’s message to its field', async () => {
    const { user } = setUp('Ada');
    await openTab(user, 'insert');
    await user.click(screen.getByTestId('ribbon-insert-link'));
    await user.type(await screen.findByTestId('ribbon-link-address'), 'data:x');
    await user.click(screen.getByTestId('ribbon-insert-link-submit'));
    expect(screen.getByTestId('ribbon-link-address')).toHaveAttribute('aria-describedby', 'ribbon-insert-link-invalid');
    expect(screen.getByTestId('ribbon-link-address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('hands a picture’s bytes to the editor, then inserts its content id at its size, fitted to the column', async () => {
    const { editor, user } = setUp('Ada');
    await openTab(user, 'insert');
    const png: File = new File([new Uint8Array([137, 80, 78, 71])], 'chart.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('ribbon-picture-file'), png);
    await waitFor((): void => expect(editor.sent).toEqual([{ name: 'insertImage', contentId: 'image-1', width: 45130, height: 33848 }]));
    expect(editor.images.map((i: { mime: string; bytes: Uint8Array }): [string, number[]] => [i.mime, [...i.bytes]])).toEqual([['image/png', [137, 80, 78, 71]]]);
  });

  it('refuses a picture type the outputs cannot draw, and says so', async () => {
    const { editor } = setUp('Ada');
    // The picker's accept filter would hide the SVG; a drag-drop or an old browser need not.
    const user: UserEvent = userEvent.setup({ applyAccept: false });
    await openTab(user, 'insert');
    const svg: File = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    await user.upload(screen.getByTestId('ribbon-picture-file'), svg);
    expect(await screen.findByText('Could not insert the picture. logo.svg is not a PNG or JPEG picture.')).toBeInTheDocument();
    expect(editor.images).toEqual([]);
    expect(editor.sent).toEqual([]);
  });

  it('signs a comment with the signed-in name, a fresh id and the time', async () => {
    const { editor, user } = setUp('Ada Lovelace');
    await openTab(user, 'insert');
    await user.click(screen.getByTestId('ribbon-insert-comment'));
    await user.click(await screen.findByTestId('ribbon-insert-comment-submit'));
    expect(screen.getByTestId('ribbon-insert-comment-invalid')).toHaveTextContent('Write the comment first.');
    await user.type(screen.getByTestId('ribbon-comment-text'), '  Check this figure  ');
    await user.click(screen.getByTestId('ribbon-insert-comment-submit'));
    await waitFor((): void => expect(editor.sent).toEqual([{
      name: 'insertComment',
      comment: { id: 'comment-1', author: 'Ada Lovelace', date: FIXED_ENVIRONMENT.now(), text: 'Check this figure', resolved: false },
    }]));
  });

  it('cannot comment before the name has loaded', async () => {
    const { editor, user } = setUp(null);
    await openTab(user, 'insert');
    expect(screen.getByTestId('ribbon-insert-comment')).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByTestId('ribbon-insert-comment'));
    expect(screen.queryByTestId('ribbon-insert-comment-dialog')).toBeNull();
    expect(editor.sent).toEqual([]);
  });

  it('inserts a footnote with a fresh id, each break kind, and a symbol', async () => {
    const { editor, user } = setUp('Ada');
    await openTab(user, 'insert');
    await user.click(screen.getByTestId('ribbon-insert-footnote'));
    for (const kind of ['page', 'column', 'line']) await user.click(screen.getByTestId(`ribbon-insert-break-${kind}`));
    await user.click(screen.getByTestId('ribbon-insert-symbol'));
    await user.click(await screen.findByTestId('ribbon-symbol-a9'));
    await waitFor((): void => expect(editor.sent).toEqual([
      { name: 'insertFootnote', id: 7 },
      { name: 'insertBreak', kind: 'page' },
      { name: 'insertBreak', kind: 'column' },
      { name: 'insertBreak', kind: 'line' },
      { name: 'insertText', text: '©' },
    ]));
  });
});

describe('the Layout ribbon', () => {
  it('sets indents and spacing in points, as Pt100', async () => {
    const { editor, user } = setUp('Ada');
    await openTab(user, 'layout');
    await user.type(screen.getByTestId('ribbon-layout-indent-left'), '36{Enter}');
    await user.type(screen.getByTestId('ribbon-layout-indent-right'), '-4.5{Enter}');
    await user.type(screen.getByTestId('ribbon-layout-spacing-after'), '8{Enter}');
    await user.click(screen.getByTestId('ribbon-layout-break-page'));
    await waitFor((): void => expect(editor.sent).toEqual([
      { name: 'setParagraphProperty', patch: { indent: { left: 3600 } } },
      { name: 'setParagraphProperty', patch: { indent: { right: -450 } } },
      { name: 'setParagraphProperty', patch: { spacing: { after: 800 } } },
      { name: 'insertBreak', kind: 'page' },
    ]));
  });

  it('offers no page-setup controls the editor cannot run', async () => {
    const { user } = setUp('Ada');
    await openTab(user, 'layout');
    expect(screen.queryByText(/margins|orientation/i)).toBeNull();
  });
});
