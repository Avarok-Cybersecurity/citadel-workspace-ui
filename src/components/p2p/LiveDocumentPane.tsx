import { lazy, Suspense, type LazyExoticComponent, type ComponentType } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The live document, loaded when one is first opened.
 *
 * The editor (TipTap, ProseMirror, the Yjs bindings, the cursor layer) is the
 * heaviest dependency subtree in the messenger and most chats never open a
 * document, so it is its own chunk rather than part of every page load.
 */
type ViewProps = React.ComponentProps<typeof import('./LiveDocumentView').LiveDocumentView>;
const LiveDocumentView: LazyExoticComponent<ComponentType<ViewProps>> = lazy(
  () => import('./LiveDocumentView').then((m) => ({ default: m.LiveDocumentView })),
);

/** Same silhouette as the loaded view -- header, toolbar, page -- so nothing jumps when it arrives. */
export function LiveDocumentSkeleton(): JSX.Element {
  return (
    <div className="h-full flex flex-col bg-background" role="status" aria-live="polite" data-testid="live-doc-loading">
      <span className="sr-only">Loading the document editor</span>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface/50">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="flex gap-2 p-2 border-b border-surface/50">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-7 w-7" />)}
      </div>
      <div className="flex-1 p-6 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function LiveDocumentPane(props: ViewProps): JSX.Element {
  return (
    <Suspense fallback={<LiveDocumentSkeleton />}>
      <LiveDocumentView {...props} />
    </Suspense>
  );
}
