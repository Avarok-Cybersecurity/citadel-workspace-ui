import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { isEnterCommit } from '@/lib/keyboard-commit';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';

interface LiveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateDocument: (title: string, initialContent: string) => void;
  initialContent?: string;
}

export function LiveDocumentModal({
  isOpen,
  onClose,
  onCreateDocument,
  initialContent = '',
}: LiveDocumentModalProps) {
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (): Promise<void> => {
    if (!title.trim()) return;
    // The Create button is disabled while in flight, but the Enter path below
    // bypassed the button entirely: two Enters during a slow create made two
    // documents.
    if (isCreating) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      await onCreateDocument(title.trim(), initialContent);
      setTitle('');
      onClose();
    } catch (error) {
      debugLog('LiveDocumentModal', 'Failed to create document:', error);
      // debugLog is a no-op outside dev, so this left the modal open with the
      // title still in it and no indication anything had gone wrong.
      setCreateError('Could not create the document. Check your connection and try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (isEnterCommit(e) && title.trim()) {
      runAsyncSetup(handleCreate);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-background border-surface text-foreground sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/20">
              <FileText className="h-5 w-5 text-primary-accent" />
            </div>
            <DialogTitle className="text-lg font-semibold">Create Live Document</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground">
            Enter a title for your collaborative document. Both you and your peer will be able to edit it in real-time.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Input
            placeholder="Document title..."
            data-testid="live-doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-surface border-surface text-foreground placeholder-gray-400 focus:border-primary"
            // Focus moving into a dialog when it opens is expected: it is where
            // the user just asked to go, and without it a keyboard user is left
            // outside the dialog they just opened.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-2">
            This will send a live document invitation to your peer.
          </p>
        </div>

        {createError && (
          <p role="alert" className="px-1 text-sm text-destructive-emphasis">
            {createError}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          >
            Cancel
          </Button>
          <Button
            data-testid="live-doc-create"
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="bg-primary text-primary-foreground"
          >
            {isCreating ? 'Creating...' : 'Create & Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
