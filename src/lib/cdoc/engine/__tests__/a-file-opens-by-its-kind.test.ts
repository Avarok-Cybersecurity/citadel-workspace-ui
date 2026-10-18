/**
 * A file opens in Citadel Docs by its kind, through the one engine: the bytes go to the worker
 * host, the engine imports them by format and lays the result out, and the import report comes
 * back with the pages. What came through is read back by exporting the opened document as text.
 * The production host, engine and wasm throughout; no mocks.
 */
import { describe, expect, it } from 'vitest';
import type { CdocClient } from '../../worker/cdoc-client';
import { transferablesOf } from '../../worker/protocol';
import { openedPages, type OpenedPages } from '../../__tests__/wasm-rig';
import type { OpenedDocument } from '../cdoc-engine';
import { refusedMacros } from '../../conversion-report';
import { bytesOf, fixture, freshClient, text } from '../../__tests__/files-rig';
import type { DocsImportFormat } from '../../../citadel-apps/docs-file-kinds';

async function openAndRead(format: DocsImportFormat, bytes: Uint8Array): Promise<{ opened: OpenedPages; asText: string }> {
  const client: CdocClient = freshClient();
  const opened: OpenedPages = openedPages(await client.request({ kind: 'open', source: { kind: 'file', format, bytes } }));
  const out: { bytes: Uint8Array } = await client.request({ kind: 'export', target: { format: 'txt' } });
  return { opened, asText: text(out.bytes) };
}

describe('opening a file by its kind', () => {
  it('opens a .docx, with its text and the report of what Word formatting it could not carry', async () => {
    const { opened, asText } = await openAndRead('docx', fixture('textutil.docx'));
    expect(opened.pageCount).toBe(1);
    expect(asText).toContain('Heading One');
    expect(asText).toContain('apple');
    expect(opened.report.losses.length).toBeGreaterThan(0);
    expect(opened.report.losses.every((l) => l.kind === 'counted')).toBe(true);
    expect(opened.report.losses.some((l) => l.part === 'word/document.xml')).toBe(true);
  });

  it('opens a .dotx template', async () => {
    const { opened, asText } = await openAndRead('dotx', fixture('poi-test.dotx'));
    expect(opened.pageCount).toBeGreaterThanOrEqual(1);
    expect(asText).toContain('Test');
  });

  it('opens Markdown, losslessly', async () => {
    const { opened, asText } = await openAndRead('md', bytesOf('# Plan\n\nShip the *file manager* open.\n'));
    expect(asText).toContain('Ship the file manager open.');
    expect(opened.report).toEqual({ losses: [], problems: [] });
  });

  it('opens plain text, keeping each line', async () => {
    const { asText } = await openAndRead('txt', bytesOf('first line\nsecond line\n'));
    expect(asText).toMatch(/first line\n+second line/);
  });

  it('opens an .odt', async () => {
    const { opened, asText } = await openAndRead('odt', fixture('bullet_list.odt'));
    expect(opened.pageCount).toBeGreaterThanOrEqual(1);
    expect(asText).toContain('listItem1');
  });

  it('does not open a Word file with macros, and names each macro part it refused', async () => {
    const outcome: OpenedDocument = await freshClient().request({ kind: 'open', source: { kind: 'file', format: 'docx', bytes: fixture('poi-simple-macro.docm') } });
    expect(outcome.kind).toBe('refused');
    expect(refusedMacros(outcome.report)).toEqual([
      { kind: 'macros', part: 'word/vbaData.xml', bytes: 809n },
      { kind: 'macros', part: 'word/vbaProject.bin', bytes: 12800n },
    ]);
  });

  it('refuses text that is not UTF-8 rather than guessing an encoding', async () => {
    const client: CdocClient = freshClient();
    await expect(client.request({ kind: 'open', source: { kind: 'file', format: 'txt', bytes: Uint8Array.from([0x66, 0xff, 0xfe]) } })).rejects.toThrow(/not UTF-8/);
  });

  it('refuses bytes that are not the format named', async () => {
    const client: CdocClient = freshClient();
    await expect(client.request({ kind: 'open', source: { kind: 'file', format: 'docx', bytes: bytesOf('# not a zip') } })).rejects.toThrow(/cdoc open/);
  });

  it('moves the file to the worker: its buffer is in the transfer list', () => {
    const bytes: Uint8Array = fixture('textutil.docx');
    expect(transferablesOf({ kind: 'open', source: { kind: 'file', format: 'docx', bytes } })).toEqual([bytes.buffer]);
  });
});
