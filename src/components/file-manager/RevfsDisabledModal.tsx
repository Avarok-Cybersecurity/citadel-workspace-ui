import { AlertTriangle, Settings, Server, UserCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type DisabledReason = 'peer_disabled' | 'server_disabled';

interface RevfsDisabledModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: DisabledReason;
  /** Called when user clicks "Open Settings" (only for P2P) */
  onOpenSettings?: () => void;
}

/**
 * Modal displayed when RE-VFS storage is disabled.
 * Shows explanation based on whether it's peer or server storage.
 */
export function RevfsDisabledModal({
  isOpen,
  onClose,
  reason,
  onOpenSettings,
}: RevfsDisabledModalProps) {
  const isPeerDisabled = reason === 'peer_disabled';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#2E3450] border-purple-800 text-gray-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            Remote Storage Unavailable
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {isPeerDisabled
              ? 'P2P remote storage is not enabled for this peer.'
              : 'Server storage is not available.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Icon display */}
          <div className="flex justify-center py-4">
            <div className="rounded-full bg-[#1E2235] p-6">
              {isPeerDisabled ? (
                <UserCircle2 className="h-12 w-12 text-yellow-400" />
              ) : (
                <Server className="h-12 w-12 text-yellow-400" />
              )}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-[#1E2235] rounded-lg p-4 space-y-3">
            {isPeerDisabled ? (
              <>
                <p className="text-sm text-gray-300">
                  Your peer hasn't enabled remote storage on their device. To use the shared file system:
                </p>
                <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
                  <li>Ask your peer to enable remote storage in their Chat Settings</li>
                  <li>Both users must have remote storage enabled</li>
                  <li>You can still use standard file transfers</li>
                </ul>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-300">
                  The server administrator has disabled RE-VFS storage:
                </p>
                <ul className="text-sm text-gray-400 space-y-2 list-disc list-inside">
                  <li>Server-side encrypted storage is not available</li>
                  <li>Contact the administrator to request access</li>
                  <li>You can still use P2P storage with peers</li>
                </ul>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            onClick={onClose}
            className="bg-[#232536] border-purple-700 text-gray-200 hover:bg-[#555B8C] hover:text-white"
          >
            {isPeerDisabled ? 'OK' : 'Close'}
          </Button>
          {isPeerDisabled && onOpenSettings && (
            <Button
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
              className="bg-purple-700 text-white hover:bg-purple-600"
            >
              <Settings className="h-4 w-4 mr-2" />
              Open Settings
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
