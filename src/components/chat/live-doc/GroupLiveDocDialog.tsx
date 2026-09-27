/**
 * An office or room chat's live document, open for editing.
 *
 * An office or room's is kept by the server (live_docs.rs) and relayed through it
 * (YjsRelayProvider); a peer group's is kept by every member and exchanged between them
 * (GroupMeshProvider). Either way the editor itself persists nothing.
 */
import React, { useCallback } from 'react';
import type * as Y from 'yjs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { CollaborativeEditor } from '@/components/p2p/CollaborativeEditor';
import { YjsRelayProvider } from '@/lib/yjs-relay-provider/relay-provider';
import { relayTransport } from '@/lib/yjs-relay-provider/relay-transport';
import { GroupMeshProvider } from '@/lib/group-live-docs/mesh-provider';
import { sessionDocKeeper } from '@/lib/group-live-docs/group-doc-keeper-instance';
import { groupSendTransport } from '@/lib/group-conversations/group-send-transport';
import type { CollabProvider, ConnectCollab } from '@/lib/collab/collab-provider';
import WorkspaceService from '@/lib/workspace-service';
import { instanceManager } from '@/lib/multi-instance/instance-manager';
import { toast } from '@/hooks/use-toast';
import { debugLog } from '@/lib/debug-config';
import type { OpenLiveDoc } from './GroupLiveDocCard';

interface GroupLiveDocDialogProps {
  groupId: string;
  doc: OpenLiveDoc;
  currentUserName: string;
  onClose: () => void;
}

export function GroupLiveDocDialog({ groupId, doc, currentUserName, onClose }: GroupLiveDocDialogProps): JSX.Element {
  const connect: ConnectCollab = useCallback((ydoc: Y.Doc): CollabProvider => {
    const refused = (reason: string): void => { toast({ title: 'That change was not saved', description: reason, variant: 'destructive' }); };
    return groupSendTransport(groupId) === 'peer'
      ? new GroupMeshProvider(ydoc, sessionDocKeeper(), groupId, doc.id, refused)
      : new YjsRelayProvider(ydoc, doc.id, relayTransport(WorkspaceService, groupId, doc.id), refused);
  }, [groupId, doc.id]);
  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col" data-testid="group-live-doc-dialog">
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
          <DialogDescription>Everyone in this chat sees each change as it is made.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ErrorBoundary
            fallback={<p role="alert" className="p-4 text-sm text-destructive-emphasis">The document could not be opened. Close it and try again.</p>}
            onError={(error: Error) => { debugLog('GroupLiveDocDialog', 'CollaborativeEditor crashed:', error); }}
          >
            <CollaborativeEditor
              documentId={doc.id}
              connect={connect}
              persistLocally={false}
              currentUserCid={instanceManager.cid?.toString() ?? ''}
              currentUserName={currentUserName}
            />
          </ErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
}
