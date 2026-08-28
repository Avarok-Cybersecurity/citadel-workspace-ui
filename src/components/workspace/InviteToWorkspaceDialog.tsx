/**
 * How you get a colleague into your workspace.
 *
 * There was no answer to that. No invite link, no share surface, no copy
 * button — the only true entry path is Landing → "Join Workspace" → typing a
 * server address, and the product shows an existing user that address exactly
 * once, as a grey subtitle in the workspace-switcher dropdown, never framed as
 * "give this to somebody".
 *
 * So the first person sets up a workspace, wants their teammate in, and finds
 * nothing. They have to work out on their own that the teammate needs the raw
 * address and must register themselves — which is the step the product exists
 * to make easy.
 *
 * This needs no backend: the address is already known, and joining already
 * works. What was missing was saying so.
 */

import { useState } from 'react';
import { Check, Copy, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface InviteToWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  serverAddress: string | undefined;
}

export function InviteToWorkspaceDialog({
  open,
  onOpenChange,
  workspaceName,
  serverAddress,
}: InviteToWorkspaceDialogProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!serverAddress) return;
    void navigator.clipboard.writeText(serverAddress).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
            Invite someone to {workspaceName}
          </DialogTitle>
          <DialogDescription>
            Send them this address. They choose <strong>Join Workspace</strong> on the
            welcome screen, paste it in, and create their own account.
          </DialogDescription>
        </DialogHeader>

        {serverAddress ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-muted px-3 py-2 text-sm">
                {serverAddress}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={copy}
                aria-label={copied ? 'Workspace address copied' : 'Copy workspace address'}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Anyone who can reach this address can create an account on it. If your
              workspace is protected by a password, they will need that too — it is not
              included here, so send it separately.
            </p>
          </div>
        ) : (
          // Reached before the connection reports its address. Saying so beats
          // an empty box the user reads as "there is nothing to share".
          <p className="text-sm text-muted-foreground">
            The workspace address is not available yet. Give it a moment and try again.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
