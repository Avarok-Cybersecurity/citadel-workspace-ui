import { X, Check, Zap } from 'lucide-react';
import { getBubbleStyles, BUBBLE_MAX_WIDTH , type FileTransferBubbleProps } from './types';
import { BubbleFooter } from './BubbleFooter';
import { debugLog } from '@/lib/debug-config';
import { getFileIcon, formatBytes, getStatusContent } from './file-transfer-helpers';
import { activateOnKey } from '@/lib/a11y';
import type { StatusContent } from '@/components/p2p/bubbles/file-transfer-helpers';

/**
 * FileTransferBubble - Displays file transfer messages with state-dependent UI
 *
 * States (sender view):
 * - pending: "Waiting for acceptance..." + Cancel button
 * - uploading: "Uploading to server..." + progress bar
 * - staged: "File ready, waiting for acceptance..." + Cancel button
 * - transferring: Progress bar with percentage
 * - complete: "Sent successfully"
 * - declined: "Transfer declined"
 * - cancelled: "Transfer cancelled"
 * - expired: "Request expired"
 * - error: Error message
 *
 * States (receiver view):
 * - pending/staged: Accept/Decline buttons
 * - transferring: "Downloading..." + progress bar
 * - complete: "Downloaded" (clickable to open)
 * - declined: "You declined this file"
 * - cancelled: "Sender cancelled transfer"
 */
export function FileTransferBubble({
  message,
  isOwn,
  onRetry,
  onAccept,
  onDecline,
  onCancel,
  onOpen
}: FileTransferBubbleProps): JSX.Element {
  const isFailed: boolean = message.status === 'failed' || message.transfer_state === 'error';
  const bubbleStyles: string = getBubbleStyles(isOwn, isFailed);

  const state = message.transfer_state || 'pending';

  // DEBUG: Log to understand why Accept/Decline may not show
  debugLog('FileTransferBubble', '[FileTransferBubble] Debug:', {
    isOwn,
    state,
    senderCid: message.senderCid,
    recipientCid: message.recipientCid,
    transfer_id: message.transfer_id,
    fileName: message.file_name
  });
  const progress: number = message.transfer_progress || 0;
  const fileName: string = message.file_name || 'Unknown file';
  const fileSize: number = message.file_size || 0;
  const fileType: string = message.file_type || 'application/octet-stream';
  const transferMode = message.transfer_mode || 'async';

  const status: StatusContent = getStatusContent(state, isOwn, message);

  const handleClick = (): void => {
    if (status.clickable && onOpen && message.virtual_path) {
      onOpen(message.virtual_path);
    }
  };

  const handleAccept = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onAccept && message.transfer_id) {
      onAccept(message.transfer_id);
    }
  };

  const handleDecline = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onDecline && message.transfer_id) {
      onDecline(message.transfer_id);
    }
  };

  const handleCancel = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (onCancel && message.transfer_id) {
      onCancel(message.transfer_id);
    }
  };

  return (
    <div
      data-testid="file-transfer-bubble"
      data-transfer-state={state}
      data-is-own={String(isOwn)}
      className={`${BUBBLE_MAX_WIDTH} rounded-lg px-3 py-2 ${bubbleStyles}`}
    >
      <div
        className={`${status.clickable ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={activateOnKey(handleClick)}
      >
        {/* File info header */}
        <div className="flex items-start gap-3 mb-2">
          {/* File icon with thumbnail support */}
          <div className="p-2 rounded bg-foreground/10 flex-shrink-0">
            {message.file_thumbnail ? (
              <img
                src={message.file_thumbnail}
                alt={fileName}
                className="h-10 w-10 object-cover rounded"
              />
            ) : (
              getFileIcon(fileType)
            )}
          </div>

          {/* File details */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{fileName}</p>
            <div className="flex items-center gap-2 text-xs opacity-70">
              <span>{formatBytes(fileSize)}</span>
              {transferMode === 'p2p' && (
                <span className="flex items-center gap-1 text-warning-emphasis">
                  <Zap className="h-3 w-3" />
                  P2P
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status section */}
        <div className="flex items-center gap-2 mb-2">
          {status.icon}
          <span className="text-xs opacity-80">{status.text}</span>
        </div>

        {/* Progress bar */}
        {status.showProgress && (
          <div className="mb-2">
            <div
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Transfer of ${fileName}`}
            aria-valuetext={`${Math.round(progress)} percent`}
            className="h-1.5 bg-foreground/10 rounded-full overflow-hidden"
          >
              <div
                className="h-full bg-primary-accent rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs opacity-70 mt-1">
              <span>{progress}%</span>
              <span>{formatBytes(fileSize * progress / 100)} / {formatBytes(fileSize)}</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {status.showAcceptDecline && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleAccept}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-success/20 hover:bg-success/30 text-success-emphasis rounded text-sm transition-colors"
            >
              <Check className="h-4 w-4" />
              Accept
            </button>
            <button
              onClick={handleDecline}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive-emphasis rounded text-sm transition-colors"
            >
              <X className="h-4 w-4" />
              Decline
            </button>
          </div>
        )}

        {status.showCancel && (
          <div className="mt-2">
            <button
              onClick={handleCancel}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 text-foreground/80 rounded text-sm transition-colors"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        )}

        {/* Click hint for completed downloads */}
        {status.clickable && (
          <p className="text-xs opacity-60 mt-1">Click to open file</p>
        )}
      </div>

      <BubbleFooter message={message} isOwn={isOwn} onRetry={onRetry} />
    </div>
  );
}
