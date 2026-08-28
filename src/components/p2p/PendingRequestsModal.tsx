/**
 * Pending Peer Registration Requests Modal
 *
 * Displays a list of pending peer registration requests with Accept/Decline buttons.
 * Non-disruptive UX - accessible via sidebar badge.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserPlus, UserX, Loader2, Clock } from 'lucide-react';
import { peerRegistrationStore, PendingPeerRequest } from '@/lib/peer-registration-store';
import { useToast, useEventListener } from '@/hooks';
import { formatDistanceToNow } from 'date-fns';
import { debugLog } from '@/lib/debug-config';
import { peerDisplayName, peerInitials } from '@/lib/peer-display';

interface PendingRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PendingRequestsModal: React.FC<PendingRequestsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [pendingRequests, setPendingRequests] = useState<PendingPeerRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast } = useToast();

  // Load pending requests
  const loadRequests = useCallback(async () => {
    const requests: PendingPeerRequest[] = await peerRegistrationStore.getPendingRequests();
    setPendingRequests(requests);
  }, []);

  // Initial load
  useEffect(() => {
    loadRequests().catch(err => debugLog('PendingRequestsModal', 'Error:', err));
  }, [loadRequests]);

  // Listen for updates
  useEventListener('peer-requests:updated', () => {
    loadRequests().catch(err => debugLog('PendingRequestsModal', 'Error:', err));
  });

  const handleAccept = async (request: PendingPeerRequest) => {
    setProcessingId(request.id);
    try {
      await peerRegistrationStore.acceptRequest(request.id);
      // Toast removed - modal already shows success state
    } catch (error) {
      toast({
        title: 'Failed to Accept',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (request: PendingPeerRequest) => {
    setProcessingId(request.id);
    try {
      await peerRegistrationStore.declineRequest(request.id);
      toast({
        title: 'Request Declined',
        description: `Declined connection from ${request.peer_username}`,
        variant: 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Failed to Decline',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    // Sanity check: Flag stale timestamps
    const MAX_RELATIVE_AGE_MS: number = 24 * 60 * 60 * 1000; // 24 hours
    const age: number = Date.now() - timestamp;

    if (age > MAX_RELATIVE_AGE_MS) {
      // Show absolute date for old requests
      return new Date(timestamp).toLocaleDateString();
    }

    // Use date-fns for relative time (more reliable)
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card text-foreground border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <UserPlus className="h-5 w-5 mr-2" />
            Pending Connection Requests
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Users requesting to connect with you
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[350px] mt-4">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserX className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No pending requests</p>
              <p className="text-sm mt-2">
                Connection requests from other users will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-card hover:bg-surface transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
                      {peerInitials({ cid: request.peer_cid, username: request.peer_username })}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {peerDisplayName({ cid: request.peer_cid, username: request.peer_username })}
                      </p>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 mr-1" />
                        {formatTimestamp(request.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-success text-success-emphasis hover:bg-success/90 hover:text-success-foreground"
                      onClick={() => handleAccept(request)}
                      disabled={processingId === request.id}
                    >
                      {processingId === request.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Accept'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive text-destructive hover:bg-destructive/90 hover:text-destructive-foreground"
                      onClick={() => handleDecline(request)}
                      disabled={processingId === request.id}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {pendingRequests.length > 0 && (
          <div className="mt-4 p-3 bg-surface rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> Accepting a connection allows you to
              exchange direct messages with that user.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PendingRequestsModal;
