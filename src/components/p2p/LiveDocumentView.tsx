import { CollaborativeEditor } from './CollaborativeEditor';
import { FileText, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useState, useCallback } from 'react';
import { debugLog } from '@/lib/debug-config';

interface LiveDocumentViewProps {
  documentId: string;
  documentTitle: string;
  peerCid: string;
  peerName: string;
  currentUserCid: string;
  currentUserName: string;
  onSave?: (documentId: string, content: string) => void;
}

export function LiveDocumentView({
  documentId,
  documentTitle,
  peerCid,
  peerName,
  currentUserCid,
  currentUserName,
  onSave,
}: LiveDocumentViewProps) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback((content: string) => {
    // setLastSaved used to run unconditionally, outside this guard — and no
    // call site passes onSave, so the header stamped "Last saved <time>" over
    // a save that never happened. The durable write now lives in
    // useDocumentPersistence, keyed off the Y.Doc itself; this callback is only
    // for a caller that wants the content, so it must not claim anything when
    // there is no such caller.
    if (!onSave) return;
    setIsSaving(true);
    onSave(documentId, content);
    setLastSaved(new Date());
    setIsSaving(false);
  }, [documentId, onSave]);

  const handleDownload = useCallback(() => {
    // Get the editor content via the DOM (simple approach)
    const editorContent: string = document.querySelector('.ProseMirror')?.innerHTML || '';
    const blob: Blob = new Blob([editorContent], { type: 'text/html' });
    const url: string = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [documentTitle]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Document header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface/50 bg-background">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <FileText className="h-5 w-5 text-primary-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{documentTitle}</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Editing with {peerName}</span>
              {lastSaved && (
                <>
                  <span className="text-muted-foreground">|</span>
                  <span>
                    {isSaving ? 'Saving...' : `Last saved ${lastSaved.toLocaleTimeString()}`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary
          fallback={
            <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-background">
              <div className="p-4 rounded-full bg-destructive/10 mb-4">
                <FileText className="h-12 w-12 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Failed to load document editor
              </h3>
              <p className="text-muted-foreground text-sm mb-4 max-w-md">
                There was an error initializing the collaborative editor. This may be due to a connection issue with your peer.
              </p>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="bg-surface border-surface text-foreground hover:bg-surface"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload Page
              </Button>
            </div>
          }
          onError={(error) => {
            debugLog('LiveDocumentView', 'CollaborativeEditor crashed:', error);
          }}
        >
          <CollaborativeEditor
            documentId={documentId}
            peerCid={peerCid}
            currentUserCid={currentUserCid}
            currentUserName={currentUserName}
            peerName={peerName}
            onSave={handleSave}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
