/**
 * "Download as…" in the engine: the open document written as DOCX, MD, TXT and PDF by cdoc-wasm,
 * each read back to prove it is the document (DOCX by opening it again), and the formats the
 * vendored build cannot write refused by the export they need. Production host, engine, wasm.
 */
import { describe, expect, it } from 'vitest';
import type { CdocClient } from '../../worker/cdoc-client';
import type { ExportedFile } from '../../editor/file-formats';
import { openedPages } from '../../__tests__/wasm-rig';
import { bytesOf, freshClient, text, zipEntryText } from '../../__tests__/files-rig';

const MD: string = '# Quarterly plan\n\nShip **open** and *export*.\n';

async function openedMarkdown(): Promise<CdocClient> {
  const client: CdocClient = freshClient();
  openedPages(await client.request({ kind: 'open', source: { kind: 'file', format: 'md', bytes: bytesOf(MD) } }));
  return client;
}

describe('exporting the open document', () => {
  it('writes a .docx that opens again with the same text', async () => {
    const out: ExportedFile = await (await openedMarkdown()).request({ kind: 'export', target: { format: 'docx' } });
    expect(text(out.bytes.slice(0, 2))).toBe('PK');
    const again: CdocClient = freshClient();
    openedPages(await again.request({ kind: 'open', source: { kind: 'file', format: 'docx', bytes: out.bytes } }));
    expect(text((await again.request({ kind: 'export', target: { format: 'txt' } })).bytes)).toContain('Ship open and export.');
  });

  it('writes Markdown that keeps the heading and emphasis', async () => {
    const out: ExportedFile = await (await openedMarkdown()).request({ kind: 'export', target: { format: 'md' } });
    expect(text(out.bytes)).toContain('# Quarterly plan');
    expect(text(out.bytes)).toContain('**open**');
  });

  it('writes plain text and reports the formatting it dropped', async () => {
    const out: ExportedFile = await (await openedMarkdown()).request({ kind: 'export', target: { format: 'txt' } });
    expect(text(out.bytes)).toContain('Ship open and export.');
    expect(out.report?.losses).toContainEqual(expect.objectContaining({ kind: 'counted', what: 'character formatting' }));
  });

  it('writes a PDF stamped with the time it was given', async () => {
    const out: ExportedFile = await (await openedMarkdown()).request({ kind: 'export', target: { format: 'pdf', nowRfc3339: '2031-02-03T04:05:06Z' } });
    expect(text(out.bytes.slice(0, 5))).toBe('%PDF-');
    expect(text(out.bytes)).toContain('20310203');
    // Through the PDF artefact, which reports no losses.
    expect(out.report).toBeNull();
  });

  it.each(['dotx', 'odt'] as const)('writes a .%s that opens again with the same text', async (format: 'dotx' | 'odt') => {
    const out: ExportedFile = await (await openedMarkdown()).request({ kind: 'export', target: { format } });
    expect(text(out.bytes.slice(0, 2))).toBe('PK');
    const again: CdocClient = freshClient();
    openedPages(await again.request({ kind: 'open', source: { kind: 'file', format, bytes: out.bytes } }));
    expect(text((await again.request({ kind: 'export', target: { format: 'txt' } })).bytes)).toContain('Ship open and export.');
  });

  it('writes a .dotx as a template and a .docx as a document', async () => {
    const client: CdocClient = await openedMarkdown();
    const dotx: ExportedFile = await client.request({ kind: 'export', target: { format: 'dotx' } });
    const docx: ExportedFile = await client.request({ kind: 'export', target: { format: 'docx' } });
    expect(zipEntryText(dotx.bytes, '[Content_Types].xml')).toContain('wordprocessingml.template.main+xml');
    expect(zipEntryText(docx.bytes, '[Content_Types].xml')).toContain('wordprocessingml.document.main+xml');
  });

  it('refuses to export when nothing is open', async () => {
    await expect(freshClient().request({ kind: 'export', target: { format: 'md' } })).rejects.toThrow(/no document is open/);
  });
});
