/**
 * The read-only page view: opens a document in cdoc and shows it in the page column. The
 * editable view (EditorPageView) shares the column and adds the editor's input and overlays.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DocumentSource } from '@/lib/cdoc/document-source';
import type { CdocClient } from '@/lib/cdoc/worker/cdoc-client';
import type { PageRenderer } from '@/lib/cdoc/paint/page-renderer';
import { messageOf, PageColumn, type PageStatus } from './page-view/PageColumn';

export { PAGE_GAP_PX, type PageStatus } from './page-view/PageColumn';

export interface PageViewProps {
  readonly client: CdocClient;
  readonly renderer: PageRenderer;
  readonly source: DocumentSource;
  readonly zoom: number;
  readonly dpr: number;
  readonly onZoomChange: (zoom: number) => void;
  readonly onPageStatus: (status: PageStatus) => void;
}

type Opened = { readonly kind: 'opening' } | { readonly kind: 'open'; readonly sizes: Int32Array } | { readonly kind: 'failed'; readonly message: string };

export function PageView({ client, renderer, source, zoom, dpr, onZoomChange, onPageStatus }: PageViewProps): JSX.Element {
  const scroller: RefObject<HTMLDivElement> = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<Opened>({ kind: 'opening' });

  useEffect((): (() => void) => {
    let live: boolean = true;
    setOpened({ kind: 'opening' });
    renderer.reset();
    client.request({ kind: 'open', source }).then(
      (doc) => { if (live) setOpened({ kind: 'open', sizes: doc.pageSizes }); },
      (error: unknown) => { if (live) setOpened({ kind: 'failed', message: messageOf(error) }); },
    );
    return (): void => { live = false; };
  }, [client, renderer, source]);

  if (opened.kind === 'failed') {
    return <p role="alert" data-testid="page-view-error" className="p-6 text-sm text-destructive">This document could not be opened. {opened.message}</p>;
  }
  return (
    <PageColumn
      renderer={renderer} sizes={opened.kind === 'open' ? opened.sizes : null} zoom={zoom} dpr={dpr}
      onZoomChange={onZoomChange} onPageStatus={onPageStatus} scroller={scroller} editing={null}
    >
      {null}
    </PageColumn>
  );
}
