/**
 * Citadel Docs inside DocumentHost: loads the cdoc runtime (worker + renderer) when it mounts,
 * shows the page view, and fills the host's status bar. DocumentHost imports this lazily, and
 * this reaches cdoc only through `loadRuntime`, so neither is in the shell's bundle.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DocumentSource } from '@/lib/cdoc/document-source';
import type { CdocRuntimeFactory } from '@/lib/cdoc/runtime-loader';
import type { CdocRuntime } from '@/lib/cdoc/runtime';
import { PageView, type PageStatus } from './PageView';
import { DocsStatusBar } from './page-view/DocsStatusBar';
import { useDevicePixelRatio } from './page-view/use-device-pixel-ratio';
import { INITIAL_ZOOM } from './page-view/zoom';

export interface DocsCanvasProps {
  readonly documentSource: DocumentSource;
  readonly loadRuntime: CdocRuntimeFactory;
  /** The host's status bar; null until it has mounted. */
  readonly statusBar: HTMLElement | null;
}

type Runtime = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly runtime: CdocRuntime } | { readonly kind: 'failed'; readonly message: string };

export default function DocsCanvas({ documentSource, loadRuntime, statusBar }: DocsCanvasProps): JSX.Element {
  const [state, setState] = useState<Runtime>({ kind: 'loading' });
  const [zoom, setZoom] = useState<number>(INITIAL_ZOOM);
  const [status, setStatus] = useState<PageStatus | null>(null);
  const dpr: number = useDevicePixelRatio();
  const onPageStatus: (next: PageStatus) => void = useCallback((next: PageStatus): void => setStatus(next), []);

  useEffect((): (() => void) => {
    let live: boolean = true;
    let loaded: CdocRuntime | null = null;
    loadRuntime().then(
      (runtime: CdocRuntime): void => {
        if (!live) return runtime.client.dispose();
        loaded = runtime;
        setState({ kind: 'ready', runtime });
      },
      (error: unknown): void => {
        if (live) setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return (): void => {
      live = false;
      loaded?.client.dispose();
    };
  }, [loadRuntime]);

  return (
    <>
      {state.kind === 'ready' && (
        <PageView client={state.runtime.client} renderer={state.runtime.renderer} source={documentSource} zoom={zoom} dpr={dpr} onZoomChange={setZoom} onPageStatus={onPageStatus} />
      )}
      {state.kind === 'loading' && <p role="status" className="m-auto text-sm text-muted-foreground">Loading Citadel Docs…</p>}
      {state.kind === 'failed' && <p role="alert" className="m-auto p-6 text-sm text-destructive">Citadel Docs could not start. {state.message}</p>}
      {statusBar !== null && createPortal(<DocsStatusBar status={status} zoom={zoom} onZoomChange={setZoom} />, statusBar)}
    </>
  );
}
