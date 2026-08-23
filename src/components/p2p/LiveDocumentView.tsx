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
    setIsSaving(true);
    if (onSave) {
      onSave(documentId, content);
    }
    setLastSaved(new Date());
    setIsSaving(false);
  }, [documentId, onSave]);

  const handleDownload = useCallback(() => {
    // Get the editor content via the DOM (simple approach)
    const editorContent = document.querySelector('.ProseMirror')?.innerHTML || '';
    const blob = new Blob([editorContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [documentTitle]);

  return (
    <div className="h-full flex flex-col bg-[#1C1D28]">
      {/* Document header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#262C4A]/50 bg-[#1a1b26]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#6E59A5]/20">
            <FileText className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{documentTitle}</h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>Editing with {peerName}</span>
              {lastSaved && (
                <>
                  <span className="text-gray-600">|</span>
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
            className="text-gray-400 hover:text-white"
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
            <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-[#1C1D28]">
              <div className="p-4 rounded-full bg-red-500/10 mb-4">
                <FileText className="h-12 w-12 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Failed to load document editor
              </h3>
              <p className="text-gray-400 text-sm mb-4 max-w-md">
                There was an error initializing the collaborative editor. This may be due to a connection issue with your peer.
              </p>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="bg-[#262C4A] border-[#3a3f5c] text-white hover:bg-[#3a3f5c]"
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
