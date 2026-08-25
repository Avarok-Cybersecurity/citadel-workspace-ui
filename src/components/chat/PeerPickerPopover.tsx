import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAvatarColor } from './CreateGroupMembersTable';

/** Kept beside the picker so both call sites index the same palette. */
const AVATAR_COLORS_LENGTH = 7;
import type { AvailablePeer } from './create-group-types';

interface PeerPickerPopoverProps {
  /** Peers offered for selection. Callers filter out anyone already chosen. */
  peers: AvailablePeer[];
  onSelect: (peer: AvailablePeer) => void;
  label?: string;
  emptyMessage?: string;
  'data-testid'?: string;
}

/**
 * Pick a peer from the registered list.
 *
 * Extracted from CreateGroupDialog so inviting someone to an existing group uses
 * the same control as choosing the founding members — a second copy would drift,
 * and these two lists have to feel identical to be understood as the same idea.
 */
export function PeerPickerPopover({
  peers,
  onSelect,
  label = 'Add Member',
  emptyMessage = 'No more peers available',
  'data-testid': testId = 'peer-picker',
}: PeerPickerPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={peers.length === 0}
          data-testid={`${testId}-trigger`}
          className="h-8 bg-surface border-border text-foreground hover:bg-border"
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 bg-background border-border" align="end">
        <ScrollArea className="max-h-48">
          {peers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">{emptyMessage}</p>
          ) : (
            <div className="space-y-1">
              {peers.map((peer) => (
                <button
                  key={peer.cid}
                  type="button"
                  data-testid={`${testId}-option`}
                  onClick={() => {
                    onSelect(peer);
                    // Close on choose: leaving it open after a selection makes it
                    // ambiguous whether the click registered.
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-surface text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-foreground"
                    style={{ backgroundColor: getAvatarColor(parseInt(peer.cid) % AVATAR_COLORS_LENGTH) }}
                    aria-hidden="true"
                  >
                    {peer.username[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-sm text-foreground flex-1 truncate">{peer.username}</span>
                  {peer.isOnline && (
                    <span className="w-2 h-2 rounded-full bg-success" aria-label="Online" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
