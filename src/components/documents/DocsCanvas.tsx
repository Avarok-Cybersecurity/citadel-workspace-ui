/**
 * Citadel Docs inside DocumentHost: loads the cdoc runtime (worker + renderer) when it mounts,
 * shows the page view, and fills the host's status bar. A blank document opens in the editor
 * (EditorPageView over the EditorSession its ReplicaKeeper shows); a converted one (pm, model) opens
 * read-only until document content arrives as a CRDT snapshot. DocumentHost imports this lazily, and
 * this reaches cdoc only through `loadRuntime`, so neither is in the shell's bundle.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DocumentSource } from '@/lib/cdoc/document-source';
import type { CdocRuntimeFactory } from '@/lib/cdoc/runtime-loader';
import type { CdocRuntime } from '@/lib/cdoc/runtime';
import { PageView, type PageStatus } from './PageView';
import { EditorPageView } from './EditorPageView';
import type { EditorSession } from '@/lib/cdoc/editor/editor-session';
import { UNDO_PAUSE_MS, platformOf } from '@/lib/cdoc/editor/editor-config';
import { createEditorOpener } from '@/lib/cdoc/editor/editor-opener';
import type { EditorController, EditorOrigin } from '@/lib/cdoc/editor/controller';
import type { EditorSurfaceOptions } from './page-view/use-editor-surface';
import type { Ctx2D } from '@/lib/cdoc/paint/canvas-port';
import { DocsStatusBar } from './page-view/DocsStatusBar';
import { useDevicePixelRatio } from './page-view/use-device-pixel-ratio';
import { INITIAL_ZOOM } from './page-view/zoom';
import type { ActionGate } from '@/hooks/use-permission-result';
import { DocsRibbon } from './ribbon/DocsRibbon';
import { EditorControllerContext } from './ribbon/editor-context';
import { browserRibbonEnvironment, type RibbonEnvironment } from './ribbon/ribbon-environment';

/**
 * Opens and keeps the page's replica: calls `open` (this runtime's EditorOpener) as often as it
 * needs, and `show` with each replica the page should draw (a re-open replaces the previous one,
 * which the keeper disposes). Returns the teardown. DocsCanvas never disposes a replica it was
 * shown: the keeper owns replica lifetimes.
 */
export type ReplicaKeeper = (
  open: (from: EditorOrigin) => Promise<EditorSession>,
  show: (editor: EditorSession) => void,
  fail: (error: unknown) => void,
) => () => void;

export interface DocsCanvasProps {
  readonly documentSource: DocumentSource;
  readonly loadRuntime: CdocRuntimeFactory;
  /** Who opens and keeps the replica of an editable document (DocumentHost decides). */
  readonly keepReplica: ReplicaKeeper;
  /** The host's status bar; null until it has mounted. */
  readonly statusBar: HTMLElement | null;
  /** Whether the person may change the document; the ribbon says why not when they may not. */
  readonly edit: ActionGate;
  readonly commentAuthor: string | null;
}

type Runtime =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly runtime: CdocRuntime; readonly editor: EditorSession | null }
  | { readonly kind: 'failed'; readonly message: string };

const failure = (error: unknown): Runtime => ({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });

export default function DocsCanvas({ documentSource, loadRuntime, keepReplica, statusBar, edit, commentAuthor }: DocsCanvasProps): JSX.Element {
  const [state, setState] = useState<Runtime>({ kind: 'loading' });
  const [zoom, setZoom] = useState<number>(INITIAL_ZOOM);
  const [status, setStatus] = useState<PageStatus | null>(null);
  const dpr: number = useDevicePixelRatio();
  const ribbonEnvironment: RibbonEnvironment = useMemo(browserRibbonEnvironment, []);
  const onPageStatus: (next: PageStatus) => void = useCallback((next: PageStatus): void => setStatus(next), []);
  const [editError, setEditError] = useState<string | null>(null);
  const overlayContext: ((canvas: HTMLCanvasElement) => Ctx2D) | null = state.kind === 'ready' ? state.runtime.overlayContext : null;
  const input: EditorSurfaceOptions | null = useMemo(() => (overlayContext === null ? null : {
    overlayContext,
    platform: platformOf(navigator.userAgent),
    undoPauseMs: UNDO_PAUSE_MS,
    onError: (error: unknown): void => setEditError(error instanceof Error ? error.message : String(error)),
  }), [overlayContext]);

  /**
   * The live controller, one value, null while the editor opens (or for a read-only view): what
   * the ribbon's EditorControllerContext.Provider is given. A blank document opens ready to type:
   * the editor takes the keyboard once its surface has mounted (child effects run first).
   */
  const controller: EditorController | null = state.kind === 'ready' ? state.editor : null;
  useEffect((): void => {
    controller?.focus();
  }, [controller]);

  useEffect((): (() => void) => {
    let live: boolean = true;
    let loaded: CdocRuntime | null = null;
    let release: (() => void) | null = null;
    loadRuntime().then((runtime: CdocRuntime): void => {
      loaded = runtime;
      if (!live) return runtime.client.dispose();
      if (documentSource.kind !== 'blank') return setState({ kind: 'ready', runtime, editor: null });
      release = keepReplica(
        createEditorOpener({ client: runtime.client, renderer: runtime.renderer }, (b: Uint8Array): Uint8Array => crypto.getRandomValues(b)),
        (editor: EditorSession): void => {
          if (live) setState({ kind: 'ready', runtime, editor });
        },
        (error: unknown): void => {
          if (live) setState(failure(error));
        },
      );
    }).then(
      (): void => undefined,
      (error: unknown): void => {
        if (live) setState(failure(error));
      },
    );
    return (): void => {
      live = false;
      release?.();
      loaded?.client.dispose();
    };
  }, [loadRuntime, documentSource, keepReplica]);

  return (
    <>
      {/* The ribbon drives the open editor; with none (loading, or a read-only conversion) there is no ribbon. */}
      <EditorControllerContext.Provider value={controller}>
        <DocsRibbon edit={edit} commentAuthor={commentAuthor} environment={ribbonEnvironment} />
      </EditorControllerContext.Provider>
      {state.kind === 'ready' && state.editor !== null && input !== null && (
        <EditorPageView editor={state.editor} renderer={state.runtime.renderer} zoom={zoom} dpr={dpr} onZoomChange={setZoom} onPageStatus={onPageStatus} input={input} />
      )}
      {editError !== null && <p role="alert" className="border-t p-2 text-sm text-destructive">That edit was not made. {editError}</p>}
      {state.kind === 'ready' && state.editor === null && (
        <PageView client={state.runtime.client} renderer={state.runtime.renderer} source={documentSource} zoom={zoom} dpr={dpr} onZoomChange={setZoom} onPageStatus={onPageStatus} />
      )}
      {state.kind === 'loading' && <p role="status" className="m-auto text-sm text-muted-foreground">Loading Citadel Docs…</p>}
      {state.kind === 'failed' && <p role="alert" className="m-auto p-6 text-sm text-destructive">Citadel Docs could not start. {state.message}</p>}
      {statusBar !== null && createPortal(<DocsStatusBar status={status} zoom={zoom} onZoomChange={setZoom} />, statusBar)}
    </>
  );
}
