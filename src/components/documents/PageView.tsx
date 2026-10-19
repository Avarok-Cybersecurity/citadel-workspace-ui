/**
 * The read-only page view: opens a document in cdoc and shows it in the page column. The
 * editable view (EditorPageView) shares the column and adds the editor's input and overlays.
 */
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { DocumentSource } from '@/lib/cdoc/document-source';
import type { OpenedDocument } from '@/lib/cdoc/engine/cdoc-engine';
import type { CdocClient } from '@/lib/cdoc/worker/cdoc-client';
import type { PageRenderer } from '@/lib/cdoc/paint/page-renderer';
import { messageOf, PageColumn, type PageStatus } from './page-view/PageColumn';
import { NotOpened, type OriginalFile } from './NotOpened';
import type { PaintAhead } from './page-view/warm-pages';

export { PAGE_GAP_PX, type PageStatus } from './page-view/PageColumn';

/** How an open ended: what the engine opened or refused, or that it failed (said in the view). */
export type OpenOutcome = OpenedDocument | { readonly kind: 'failed' };

export interface PageViewProps {
  readonly client: CdocClient;
  readonly renderer: PageRenderer;
  readonly source: DocumentSource;
  readonly zoom: number;
  readonly dpr: number;
  readonly onZoomChange: (zoom: number) => void;
  readonly onPageStatus: (status: PageStatus) => void;
  /** How opening ended, the conversion report included; called once per open (need not be stable). */
  readonly onOpened: (outcome: OpenOutcome) => void;
  /** The file the document came from, offered for download if the engine refuses to open it. */
  readonly original: OriginalFile | null;
  readonly paintAhead: PaintAhead;
}

type Opened =
  | { readonly kind: 'opening' }
  | { readonly kind: 'open'; readonly sizes: Int32Array }
  | { readonly kind: 'refused' }
  | { readonly kind: 'failed'; readonly message: string };

const MACROS_REFUSED: string = 'This file contains macros, which Citadel Docs never runs or keeps, so it is not opened here. The file itself is unchanged.';

/** A file's bytes move to the worker; the copy moves, so the caller's stay usable for a reopen. */
const movableSource = (source: DocumentSource): DocumentSource => (source.kind === 'file' ? { ...source, bytes: source.bytes.slice() } : source);

export function PageView({ client, renderer, source, zoom, dpr, onZoomChange, onPageStatus, onOpened, original, paintAhead }: PageViewProps): JSX.Element {
  const scroller: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<Opened>({ kind: 'opening' });
  // The latest callback, so a caller passing a new function each render does not reopen the document.
  const openedListener: MutableRefObject<(outcome: OpenOutcome) => void> = useRef(onOpened);
  useEffect((): void => { openedListener.current = onOpened; }, [onOpened]);

  useEffect((): (() => void) => {
    let live: boolean = true;
    setOpened({ kind: 'opening' });
    renderer.reset();
    client.request({ kind: 'open', source: movableSource(source) }).then(
      (doc: OpenedDocument): void => {
        if (!live) return;
        openedListener.current(doc);
        setOpened(doc.kind === 'opened' ? { kind: 'open', sizes: doc.pageSizes } : { kind: 'refused' });
      },
      (error: unknown): void => {
        if (!live) return;
        openedListener.current({ kind: 'failed' });
        setOpened({ kind: 'failed', message: messageOf(error) });
      },
    );
    return (): void => { live = false; };
  }, [client, renderer, source]);

  if (opened.kind === 'failed') {
    return <p role="alert" data-testid="page-view-error" className="p-6 text-sm text-destructive">This document could not be opened. {opened.message}</p>;
  }
  if (opened.kind === 'refused') {
    if (original !== null) return <NotOpened original={original} why={MACROS_REFUSED} testId="page-view-refused" />;
    return <p role="alert" data-testid="page-view-refused" className="p-6 text-sm text-foreground">{MACROS_REFUSED}</p>;
  }
  return (
    <PageColumn
      renderer={renderer} sizes={opened.kind === 'open' ? opened.sizes : null} zoom={zoom} dpr={dpr}
      onZoomChange={onZoomChange} onPageStatus={onPageStatus} scroller={scroller} editing={null} paintAhead={paintAhead}
    >
      {null}
    </PageColumn>
  );
}
