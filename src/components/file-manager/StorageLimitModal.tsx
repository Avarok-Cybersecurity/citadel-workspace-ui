import { AlertCircle, HardDrive } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StorageLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  usedBytes: number;
  quotaBytes: number;
  attemptedFileSize: number;
  /** Called when user clicks "Manage Storage" */
  onManageStorage?: () => void;
}

/**
 * Format bytes to human-readable string (e.g., "45.2 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value < 10 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Modal displayed when a file upload would exceed storage quota.
 * Shows current usage, available space, and options to manage storage.
 */
export function StorageLimitModal({
  isOpen,
  onClose,
  usedBytes,
  quotaBytes,
  attemptedFileSize,
  onManageStorage,
}: StorageLimitModalProps) {
  const availableBytes = Math.max(0, quotaBytes - usedBytes);
  const percentage = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;

  // Determine bar color based on usage
  const barColor = percentage >= 95
    ? 'bg-red-500'
    : percentage >= 80
      ? 'bg-yellow-500'
      : 'bg-purple-500';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#2E3450] border-purple-800 text-gray-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <AlertCircle className="h-5 w-5 text-red-400" />
            Storage Limit Reached
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Not enough space to upload this file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Storage usage display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-gray-400">
                <HardDrive className="h-4 w-4" />
                Current Usage
              </span>
              <span className="text-gray-300">
                {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-[#1E2235] rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-300', barColor)}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* File size info */}
          <div className="bg-[#1E2235] rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">File size:</span>
              <span className="text-white font-medium">{formatBytes(attemptedFileSize)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Available space:</span>
              <span className="text-red-400 font-medium">{formatBytes(availableBytes)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Space needed:</span>
              <span className="text-yellow-400 font-medium">
                {formatBytes(Math.max(0, attemptedFileSize - availableBytes))} more
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-400">
            Delete some files to free up space, or contact the server administrator to increase your quota.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-[#232536] border-purple-700 text-gray-200 hover:bg-[#555B8C] hover:text-white"
          >
            Cancel
          </Button>
          {onManageStorage && (
            <Button
              onClick={() => {
                onManageStorage();
                onClose();
              }}
              className="bg-purple-700 text-white hover:bg-purple-600"
            >
              Manage Storage
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
