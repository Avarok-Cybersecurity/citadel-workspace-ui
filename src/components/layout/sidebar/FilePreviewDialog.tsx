/**
 * What happened to a file someone sent you.
 *
 * This used to be a preview dialog, and every control in it operated on a path
 * the browser can never resolve. A completed P2P transfer records
 * `downloadPath` — where the INTERNAL SERVICE, on its own filesystem, wrote the
 * file. The dialog treated it as a URL:
 *
 *   txt/md   rendered the path string as the document body, so a user asking
 *            to read their notes read "/root/.citadel/downloads/notes.txt"
 *   pdf      iframed the path against the page origin — a 404 and a blank frame
 *   xlsx/doc iframed view.officeapps.live.com with the path as `src`, which the
 *            CSP blocks outright and which Microsoft could not have fetched
 *   Download  set an anchor href to the path — another origin-relative 404
 *
 * There is no route from the browser to that file: the agent is a separate
 * process with its own filesystem, and the direct-P2P path deliberately writes
 * there rather than streaming bytes into the page. So the dialog now says what
 * is true — the file arrived, here is what it is, here is where it landed —
 * with the path copyable, which is the only action that helps.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, Check, Copy, FileSpreadsheet, FileText, FileType, FileCode, HardDrive, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatFileSize } from '@/lib/utils';
import { useState } from 'react';

interface FileDetails {
  id: string;
  name: string;
  type: string;
  size: number;
  sender: {
    name: string;
    avatar: string;
  };
  createdAt: string;
  /** Where the agent saved it, on the agent's filesystem. Not a URL. */
  savedTo: string;
}

interface FilePreviewDialogProps {
  file: FileDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

const getFileIcon: (fileName: string) => JSX.Element = (fileName: string): JSX.Element => {
  const extension: string | undefined = fileName.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="h-5 w-5 text-foreground/80" />;
    case 'pdf':
      return <FileType className="h-5 w-5 text-foreground/80" />;
    case 'md':
    case 'mdx':
    case 'txt':
    case 'doc':
    case 'docx':
    case 'odt':
      return <FileText className="h-5 w-5 text-foreground/80" />;
    default:
      return <FileCode className="h-5 w-5 text-foreground/80" />;
  }
};

function SavedLocation({ path }: { path: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  if (!path) {
    // Reached when a transfer completed without reporting a path. Saying so is
    // better than an empty field the user reads as "nowhere".
    return (
      <p className="text-sm text-muted-foreground">
        The agent did not report where this file was saved.
      </p>
    );
  }

  const copy = (): void => {
    void navigator.clipboard.writeText(path).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Saved by your local agent to:
      </p>
      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs text-foreground">
          {path}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={copy}
          aria-label={copied ? 'File path copied' : 'Copy file path'}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export const FilePreviewDialog = ({ file, isOpen, onClose }: FilePreviewDialogProps): JSX.Element | null => {
  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-surface text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
            {getFileIcon(file.name)}
            {file.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" aria-hidden="true" />
            <Avatar className="h-6 w-6">
              <AvatarImage src={file.sender.avatar} alt="" />
              <AvatarFallback>{file.sender.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span>Sent by {file.sender.name}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span>{file.createdAt}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDrive className="h-4 w-4" aria-hidden="true" />
            <span>
              {formatFileSize(file.size)}
              {file.type && file.type !== 'Unknown' ? ` · ${file.type}` : ''}
            </span>
          </div>

          <SavedLocation path={file.savedTo} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
