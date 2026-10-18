/**
 * The page: a file input, then the document in the shipped editor (DocsCanvas: ribbons, page view,
 * status bar) laid out as DocumentHost lays it out, and
 * "Download as…" writing PDF or plain text through the editor's own export. One document per page
 * load, as the protocol opens one per fresh tab. The replica keeper opens the file's bytes;
 * everything else is the product's.
 */
import { lazy, Suspense, useCallback, useMemo, useState, type ChangeEvent, type LazyExoticComponent } from 'react';
import type { DocsCanvasProps, ReplicaKeeper } from '@/components/documents/DocsCanvas';
import type { DocumentSource } from '@/lib/cdoc/document-source';
import type { EditorSession } from '@/lib/cdoc/editor/editor-session';
import type { ExportTarget } from '@/lib/cdoc/editor/file-formats';
import { loadCdocRuntime, type CdocRuntimeFactory } from '@/lib/cdoc/runtime-loader';
import type { CdocRuntime } from '@/lib/cdoc/runtime';
import type { ActionGate } from '@/hooks/use-permission-result';
import { browserDocumentFiles } from '@/lib/document-files';
import { keystrokePaint, type KeystrokePaint } from './instrument';

const DocsCanvas: LazyExoticComponent<(props: DocsCanvasProps) => JSX.Element> = lazy(() => import('@/components/documents/DocsCanvas'));

/** Editable: DocsCanvas opens a replica through the keeper, which opens the file's bytes. */
const EDITABLE: DocumentSource = { kind: 'blank' };
const MAY_EDIT: ActionGate = { enabled: true, reason: null };
const probe: KeystrokePaint = keystrokePaint(window);
const loadRuntime: CdocRuntimeFactory = async (): Promise<CdocRuntime> => {
  const runtime: CdocRuntime = await loadCdocRuntime();
  return { ...runtime, renderer: probe.renderer(runtime.renderer) };
};

interface Opened {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const EXPORTS: ReadonlyArray<{ readonly label: string; readonly extension: string; readonly mime: string; readonly target: () => ExportTarget }> = [
  { label: 'PDF (.pdf)', extension: 'pdf', mime: 'application/pdf', target: (): ExportTarget => ({ format: 'pdf', nowRfc3339: new Date().toISOString() }) },
  { label: 'Plain text (.txt)', extension: 'txt', mime: 'text/plain', target: (): ExportTarget => ({ format: 'txt' }) },
];

function save(bytes: Uint8Array, name: string, mime: string): void {
  const url: string = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  const a: HTMLAnchorElement = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout((): void => URL.revokeObjectURL(url), 60_000);
}

function fileKeeper(file: Opened, onSession: (editor: EditorSession | null) => void): ReplicaKeeper {
  return (open, show, fail): (() => void) => {
    let live: boolean = true;
    let held: EditorSession | null = null;
    let unwatch: (() => void) | null = null;
    open({ kind: 'bytes', bytes: file.bytes, format: 'docx' }).then(
      (editor: EditorSession): void => {
        if (!live) return editor.dispose();
        held = editor;
        unwatch = probe.session(editor);
        onSession(editor);
        show(editor);
      },
      (error: unknown): void => {
        if (live) fail(error);
      },
    );
    return (): void => {
      live = false;
      unwatch?.();
      onSession(null);
      held?.dispose();
    };
  };
}

function DownloadAs({ editor, name }: { readonly editor: EditorSession | null; readonly name: string }): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('');
  const run = useCallback(async (choice: (typeof EXPORTS)[number]): Promise<void> => {
    if (editor === null) return;
    setOpen(false);
    setStatus(`Preparing ${choice.extension.toUpperCase()}…`);
    try {
      const file: { readonly bytes: Uint8Array } = await editor.exportAs(choice.target());
      save(file.bytes, `${name.replace(/\.docx$/i, '')}.${choice.extension}`, choice.mime);
      setStatus(`Downloaded ${choice.extension.toUpperCase()}`);
    } catch (error: unknown) {
      setStatus(`Could not export: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [editor, name]);
  return (
    <div className="relative flex items-center gap-2">
      <button type="button" aria-haspopup="menu" aria-expanded={open} disabled={editor === null} data-testid="bench-download-as" className="rounded border border-border px-3 py-1 text-sm disabled:opacity-40" onClick={(): void => setOpen(!open)}>
        Download as…
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 top-full z-50 mt-1 rounded border border-border bg-background p-1 shadow">
          {EXPORTS.map((choice: (typeof EXPORTS)[number]) => (
            <li key={choice.extension} role="none">
              <button type="button" role="menuitem" data-testid={`bench-export-${choice.extension}`} className="w-full whitespace-nowrap rounded px-3 py-1 text-left text-sm hover:bg-foreground/10" onClick={(): void => void run(choice)}>
                {choice.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="text-xs text-muted-foreground">{status}</p>
    </div>
  );
}

export function BenchHarness(): JSX.Element {
  const [file, setFile] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorSession | null>(null);
  const [statusBar, setStatusBar] = useState<HTMLElement | null>(null);
  const keeper: ReplicaKeeper | null = useMemo(() => (file === null ? null : fileKeeper(file, setEditor)), [file]);
  const choose = (e: ChangeEvent<HTMLInputElement>): void => {
    const chosen: File | undefined = e.target.files?.[0];
    if (chosen === undefined) return;
    if (!/\.docx$/i.test(chosen.name)) return setError(`${chosen.name} is not a .docx`);
    chosen.arrayBuffer().then(
      (buffer: ArrayBuffer): void => setFile({ name: chosen.name, bytes: new Uint8Array(buffer) }),
      (reason: unknown): void => setError(reason instanceof Error ? reason.message : String(reason)),
    );
  };
  return (
    <div className="flex h-full min-w-0 flex-col bg-background" data-testid="document-host">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h1 className="truncate text-lg font-semibold text-foreground">{file?.name ?? 'Citadel Docs bench harness'}</h1>
        {file === null ? (
          <label className="text-sm">
            Open a .docx <input type="file" accept=".docx" data-testid="bench-open" onChange={choose} />
          </label>
        ) : (
          <DownloadAs editor={editor} name={file.name} />
        )}
      </header>
      {error !== null && <p role="alert" className="p-2 text-sm text-destructive">{error}</p>}
      <section aria-label="Citadel Docs editor" data-testid="document-editor-region" className="flex min-h-0 flex-1 flex-col">
        {file !== null && keeper !== null && (
          <Suspense fallback={<p role="status" className="m-auto text-sm text-muted-foreground">Loading Citadel Docs…</p>}>
            <DocsCanvas documentSource={EDITABLE} loadRuntime={loadRuntime} keepReplica={keeper} statusBar={statusBar} edit={MAY_EDIT} commentAuthor="Benchmark"
              title={file.name.replace(/\.docx$/i, '')} files={browserDocumentFiles} original={null} />
          </Suspense>
        )}
      </section>
      <footer ref={setStatusBar} data-testid="document-status-bar" className="border-t border-border px-4 py-1.5" />
    </div>
  );
}
