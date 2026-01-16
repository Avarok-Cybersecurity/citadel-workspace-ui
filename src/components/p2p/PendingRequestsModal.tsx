/**
 * Pending Peer Registration Requests Modal
 *
 * Displays a list of pending peer registration requests with Accept/Decline buttons.
 * Non-disruptive UX - accessible via sidebar badge.
 */

import React, { useState, useEffect } from 'react';
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
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

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

  // Subscribe to pending requests updates
  useEffect(() => {
    const updateRequests = async () => {
      const requests = await peerRegistrationStore.getPendingRequests();
      setPendingRequests(requests);
    };

    // Initial load
    void updateRequests();

    // Listen for updates
    eventEmitter.on('peer-requests:updated', updateRequests);
    return () => {
      eventEmitter.off('peer-requests:updated', updateRequests);
    };
  }, []);

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
        className: 'bg-[#343A5C] border-red-600 text-red-400',
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
    const MAX_RELATIVE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    const age = Date.now() - timestamp;

    if (age > MAX_RELATIVE_AGE_MS) {
      // Show absolute date for old requests
      return new Date(timestamp).toLocaleDateString();
    }

    // Use date-fns for relative time (more reliable)
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  const getUserInitial = (username: string): string => {
    return username.charAt(0).toUpperCase();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#343A5C] text-white border-gray-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <UserPlus className="h-5 w-5 mr-2" />
            Pending Connection Requests
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Users requesting to connect with you
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[350px] mt-4">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
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
                  className="flex items-center justify-between p-4 rounded-lg bg-[#444A6C] hover:bg-[#4F5889] transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
                      {getUserInitial(request.peer_username)}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {request.peer_username}
                      </p>
                      <div className="flex items-center text-xs text-gray-400">
                        <span className="truncate max-w-[120px]">
                          CID: {request.peer_cid.toString().slice(0, 8)}...
                        </span>
                        <span className="mx-2">•</span>
                        <Clock className="h-3 w-3 mr-1" />
                        {formatTimestamp(request.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-green-600 text-green-400 hover:bg-green-600 hover:text-white"
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
                      className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
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
          <div className="mt-4 p-3 bg-[#3A3F5C] rounded-lg">
            <p className="text-xs text-gray-400">
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
