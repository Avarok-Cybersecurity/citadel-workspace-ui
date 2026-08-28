import { File, FileImage, FileText, FileVideo, FileAudio, Download, X, Check, Clock, AlertCircle, Ban } from 'lucide-react';
import type { P2PMessage } from '@/lib/p2p';

export interface StatusContent {
  icon: React.ReactNode;
  text: string;
  showCancel?: boolean;
  showAcceptDecline?: boolean;
  showProgress?: boolean;
  clickable?: boolean;
}

/** Returns the appropriate Lucide file icon based on MIME type. */
export function getFileIcon(fileType: string): React.ReactNode {
  if (fileType.startsWith('image/')) return <FileImage className="h-5 w-5" />;
  if (fileType.startsWith('video/')) return <FileVideo className="h-5 w-5" />;
  if (fileType.startsWith('audio/')) return <FileAudio className="h-5 w-5" />;
  if (fileType.startsWith('text/') || fileType.includes('pdf')) return <FileText className="h-5 w-5" />;
  return <File className="h-5 w-5" />;
}

// Re-exported, not reimplemented. This copy used toFixed(1) while the transfer
// lifecycle's used toFixed(2), so a bubble and the progress line beside it
// showed the same file at two different sizes.
export { formatBytes } from '@/lib/format-bytes';

/** Returns the status icon, text, and action flags for a given transfer state. */
export function getStatusContent(state: string, isOwn: boolean, message: P2PMessage): StatusContent {
  switch (state) {
    case 'pending':
      if (isOwn) {
        return {
          icon: <Clock className="h-4 w-4 text-warning-emphasis" />,
          text: 'Waiting for acceptance...',
          showCancel: true
        };
      }
      return {
        icon: <Download className="h-4 w-4 text-primary-accent" />,
        text: 'wants to send you a file',
        showAcceptDecline: true
      };

    case 'uploading':
      return {
        icon: <Clock className="h-4 w-4 text-primary-accent animate-spin" />,
        text: 'Uploading to server...',
        showProgress: true
      };

    case 'staged':
      if (isOwn) {
        return {
          icon: <Check className="h-4 w-4 text-success-emphasis" />,
          text: 'File ready, waiting for acceptance...',
          showCancel: true
        };
      }
      return {
        icon: <Download className="h-4 w-4 text-primary-accent" />,
        text: 'File ready to download',
        showAcceptDecline: true
      };

    case 'transferring':
      return {
        icon: <Download className="h-4 w-4 text-primary-accent animate-pulse" />,
        text: isOwn ? 'Sending...' : 'Downloading...',
        showProgress: true
      };

    case 'complete':
      if (isOwn) {
        return {
          icon: <Check className="h-4 w-4 text-success-emphasis" />,
          text: 'Sent successfully'
        };
      }
      return {
        icon: <Check className="h-4 w-4 text-success-emphasis" />,
        text: 'Downloaded',
        clickable: true
      };

    case 'declined':
      if (isOwn) {
        return {
          icon: <X className="h-4 w-4 text-destructive" />,
          text: 'Transfer declined'
        };
      }
      return {
        icon: <X className="h-4 w-4 text-muted-foreground" />,
        text: 'You declined this file'
      };

    case 'cancelled':
      if (isOwn) {
        return {
          icon: <Ban className="h-4 w-4 text-muted-foreground" />,
          text: 'Transfer cancelled'
        };
      }
      return {
        icon: <AlertCircle className="h-4 w-4 text-warning-emphasis" />,
        text: 'Sender cancelled transfer'
      };

    case 'expired':
      return {
        icon: <Clock className="h-4 w-4 text-warning-emphasis" />,
        text: 'Request expired'
      };

    case 'error':
      return {
        icon: <AlertCircle className="h-4 w-4 text-destructive" />,
        text: message.error || 'Transfer failed'
      };

    default:
      return {
        icon: <File className="h-4 w-4" />,
        text: 'Unknown state'
      };
  }
}
