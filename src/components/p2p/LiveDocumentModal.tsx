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

  const handleCreate = async () => {
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      await onCreateDocument(title.trim(), initialContent);
      setTitle('');
      onClose();
    } catch (error) {
      console.error('Failed to create document:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && title.trim()) {
      (async () => {
        await handleCreate();
      })().catch(console.error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#1C1D28] border-[#262C4A] text-white sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-[#6E59A5]/20">
              <FileText className="h-5 w-5 text-purple-400" />
            </div>
            <DialogTitle className="text-lg font-semibold">Create Live Document</DialogTitle>
          </div>
          <DialogDescription className="text-gray-400">
            Enter a title for your collaborative document. Both you and your peer will be able to edit it in real-time.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Input
            placeholder="Document title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-[#262C4A] border-[#3a3f5c] text-white placeholder-gray-400 focus:border-[#6E59A5]"
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-2">
            This will send a live document invitation to your peer.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="bg-[#6E59A5] hover:bg-[#7c68d6] text-white"
          >
            {isCreating ? 'Creating...' : 'Create & Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
