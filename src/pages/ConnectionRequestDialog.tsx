import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import type { UserData } from '@/components/user/UserSearch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConnectionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: UserData | null;
  requestMessage: string;
  onRequestMessageChange: (message: string) => void;
  sendingRequest: boolean;
  onSend: () => void;
}

export function ConnectionRequestDialog({
  open,
  onOpenChange,
  selectedUser,
  requestMessage,
  onRequestMessageChange,
  sendingRequest,
  onSend,
}: ConnectionRequestDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card text-foreground border-border">
        <DialogHeader>
          <DialogTitle>Send Connection Request</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selectedUser && `Send a connection request to ${selectedUser.displayName}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start space-x-3 p-3 bg-card rounded-md">
            <AlertCircle className="h-5 w-5 text-primary-accent mt-0.5 flex-shrink-0" />
            <div className="text-sm text-foreground/80">
              <p>The user will need to accept your P2P registration request before you can message them. P2P connection will be automatically established after registration is accepted.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="request-message" className="text-sm font-medium text-foreground">
              Add a message (optional)
            </label>
            <textarea
              id="request-message"
              value={requestMessage}
              onChange={(e) => onRequestMessageChange(e.target.value)}
              placeholder="Tell them why you'd like to connect..."
              className="w-full h-24 px-3 py-2 bg-card border border-border rounded-md text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <DialogFooter className="flex justify-end space-x-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={sendingRequest}
            className="text-foreground/80 hover:text-foreground hover:bg-accent"
          >
            Cancel
          </Button>
          <Button
            onClick={onSend}
            disabled={sendingRequest}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {sendingRequest ? 'Sending...' : 'Send Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
