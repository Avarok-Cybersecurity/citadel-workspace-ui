import { File, FileImage, FileText, FileVideo, FileAudio, Download, X, Check, Clock, AlertCircle, Ban, Zap } from 'lucide-react';
import { getBubbleStyles } from './types';
import { BubbleFooter } from './BubbleFooter';
import type { FileTransferBubbleProps } from './types';

/**
 * FileTransferBubble - Displays file transfer messages with state-dependent UI
 *
 * States (sender view):
 * - pending: "Waiting for acceptance..." + Cancel button
 * - uploading: "Uploading to server..." + progress bar
 * - staged: "File ready, waiting for acceptance..." + Cancel button
 * - transferring: Progress bar with percentage
 * - complete: "✓ Sent successfully"
 * - declined: "✗ Transfer declined"
 * - cancelled: "Transfer cancelled"
 * - expired: "⚠ Request expired"
 * - error: Error message
 *
 * States (receiver view):
 * - pending/staged: Accept/Decline buttons
 * - transferring: "Downloading..." + progress bar
 * - complete: "✓ Downloaded" (clickable to open)
 * - declined: "✗ You declined this file"
 * - cancelled: "⚠ Sender cancelled transfer"
 */
export function FileTransferBubble({
  message,
  isOwn,
  onRetry,
  onAccept,
  onDecline,
  onCancel,
  onOpen
}: FileTransferBubbleProps) {
  const isFailed = message.status === 'failed' || message.transfer_state === 'error';
  const bubbleStyles = getBubbleStyles(isOwn, isFailed);

  const state = message.transfer_state || 'pending';

  // DEBUG: Log to understand why Accept/Decline may not show
  console.log('[FileTransferBubble] Debug:', {
    isOwn,
    state,
    senderCid: message.senderCid,
    recipientCid: message.recipientCid,
    transfer_id: message.transfer_id,
    fileName: message.file_name
  });
  const progress = message.transfer_progress || 0;
  const fileName = message.file_name || 'Unknown file';
  const fileSize = message.file_size || 0;
  const fileType = message.file_type || 'application/octet-stream';
  const transferMode = message.transfer_mode || 'async';

  // Get appropriate file icon based on MIME type
  const getFileIcon = () => {
    if (fileType.startsWith('image/')) return <FileImage className="h-5 w-5" />;
    if (fileType.startsWith('video/')) return <FileVideo className="h-5 w-5" />;
    if (fileType.startsWith('audio/')) return <FileAudio className="h-5 w-5" />;
    if (fileType.startsWith('text/') || fileType.includes('pdf')) return <FileText className="h-5 w-5" />;
    return <File className="h-5 w-5" />;
  };

  // Format file size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Get status icon and text based on state
  const getStatusContent = () => {
    switch (state) {
      case 'pending':
        if (isOwn) {
          return {
            icon: <Clock className="h-4 w-4 text-yellow-400" />,
            text: 'Waiting for acceptance...',
            showCancel: true
          };
        }
        return {
          icon: <Download className="h-4 w-4 text-sky-400" />,
          text: 'wants to send you a file',
          showAcceptDecline: true
        };

      case 'uploading':
        return {
          icon: <Clock className="h-4 w-4 text-sky-400 animate-spin" />,
          text: 'Uploading to server...',
          showProgress: true
        };

      case 'staged':
        if (isOwn) {
          return {
            icon: <Check className="h-4 w-4 text-green-400" />,
            text: 'File ready, waiting for acceptance...',
            showCancel: true
          };
        }
        return {
          icon: <Download className="h-4 w-4 text-sky-400" />,
          text: 'File ready to download',
          showAcceptDecline: true
        };

      case 'transferring':
        return {
          icon: <Download className="h-4 w-4 text-sky-400 animate-pulse" />,
          text: isOwn ? 'Sending...' : 'Downloading...',
          showProgress: true
        };

      case 'complete':
        if (isOwn) {
          return {
            icon: <Check className="h-4 w-4 text-green-400" />,
            text: 'Sent successfully'
          };
        }
        return {
          icon: <Check className="h-4 w-4 text-green-400" />,
          text: 'Downloaded',
          clickable: true
        };

      case 'declined':
        if (isOwn) {
          return {
            icon: <X className="h-4 w-4 text-red-400" />,
            text: 'Transfer declined'
          };
        }
        return {
          icon: <X className="h-4 w-4 text-gray-400" />,
          text: 'You declined this file'
        };

      case 'cancelled':
        if (isOwn) {
          return {
            icon: <Ban className="h-4 w-4 text-gray-400" />,
            text: 'Transfer cancelled'
          };
        }
        return {
          icon: <AlertCircle className="h-4 w-4 text-yellow-400" />,
          text: 'Sender cancelled transfer'
        };

      case 'expired':
        return {
          icon: <Clock className="h-4 w-4 text-orange-400" />,
          text: 'Request expired'
        };

      case 'error':
        return {
          icon: <AlertCircle className="h-4 w-4 text-red-400" />,
          text: message.error || 'Transfer failed'
        };

      default:
        return {
          icon: <File className="h-4 w-4" />,
          text: 'Unknown state'
        };
    }
  };

  const status = getStatusContent();

  const handleClick = () => {
    if (status.clickable && onOpen && message.virtual_path) {
      onOpen(message.virtual_path);
    }
  };

  const handleAccept = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAccept && message.transfer_id) {
      onAccept(message.transfer_id);
    }
  };

  const handleDecline = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDecline && message.transfer_id) {
      onDecline(message.transfer_id);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
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
      className={`max-w-[70%] rounded-lg px-3 py-2 ${bubbleStyles}`}
    >
      <div
        className={`${status.clickable ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
        onClick={handleClick}
      >
        {/* File info header */}
        <div className="flex items-start gap-3 mb-2">
          {/* File icon with thumbnail support */}
          <div className="p-2 rounded bg-white/10 flex-shrink-0">
            {message.file_thumbnail ? (
              <img
                src={message.file_thumbnail}
                alt={fileName}
                className="h-10 w-10 object-cover rounded"
              />
            ) : (
              getFileIcon()
            )}
          </div>

          {/* File details */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{fileName}</p>
            <div className="flex items-center gap-2 text-xs opacity-70">
              <span>{formatBytes(fileSize)}</span>
              {transferMode === 'p2p' && (
                <span className="flex items-center gap-1 text-yellow-400">
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
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 rounded-full transition-all duration-300"
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
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-sm transition-colors"
            >
              <Check className="h-4 w-4" />
              Accept
            </button>
            <button
              onClick={handleDecline}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-sm transition-colors"
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
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 rounded text-sm transition-colors"
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
