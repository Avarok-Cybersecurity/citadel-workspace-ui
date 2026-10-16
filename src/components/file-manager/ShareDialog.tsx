/**
 * Share: a link to each item, to copy and send.
 *
 * A link opens the file manager at the item for whoever follows it. Peer storage
 * belongs to two people, so a peer link opens for exactly those two; a server
 * link opens the reader's own server storage at that place, which is theirs, not
 * yours -- the note says so rather than letting a colleague find an empty folder.
 */
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCopyToClipboard, type CopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import type { RevfsNode } from '@/types/revfs-types';

export interface ShareLink {
  node: RevfsNode;
  url: string;
}

interface ShareDialogProps {
  links: ShareLink[] | null;
  /** Peer storage names the one other person the links open for. */
  peerName: string | null;
  onClose: () => void;
}

function LinkRow({ link }: { link: ShareLink }): JSX.Element {
  const { copied, copy }: CopyToClipboard = useCopyToClipboard();
  return (
    <li className="flex min-w-0 flex-col gap-[6px]">
      <span className="truncate text-sm font-medium text-foreground">{link.node.name}</span>
      <div className="flex min-w-0 items-center gap-[8px]">
        <input readOnly value={link.url} aria-label={`Link to ${link.node.name}`} onFocus={(e) => e.target.select()}
          className="h-[32px] min-w-0 flex-1 rounded-[6px] border border-border bg-background px-[8px] font-mono text-xs text-foreground" />
        <Button variant="outline" size="sm" className="h-[32px] shrink-0 gap-[6px]" onClick={() => void copy(link.url)}>
          {copied ? <Check className="h-[14px] w-[14px]" aria-hidden="true" /> : <Copy className="h-[14px] w-[14px]" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </li>
  );
}

export function ShareDialog({ links, peerName, onClose }: ShareDialogProps): JSX.Element {
  return (
    <Dialog open={links !== null} onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Share {links?.length === 1 ? `“${links[0].node.name}”` : `${links?.length ?? 0} items`}</DialogTitle>
          <DialogDescription>
            {peerName !== null
              ? `These links open in the storage you share with ${peerName}, for you and for them.`
              : 'These links open the same place in the reader’s own server storage.'}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-[50dvh] flex-col gap-[14px] overflow-y-auto">
          {(links ?? []).map((link: ShareLink) => <LinkRow key={link.node.path} link={link} />)}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
