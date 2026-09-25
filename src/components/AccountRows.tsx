/**
 * One row of the account manager: who, which workspace, and what can be done.
 *
 * The account in use is marked "Current" instead of being offered "Switch",
 * which from that row could only re-select what is already selected.
 */
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Trash2, Clock } from 'lucide-react';

interface AccountRowProps {
  username: string;
  host: string;
  current: boolean;
  live: boolean;
  lastConnected: string | null;
  onSwitch: () => void;
  /** Absent for a live session with no saved account to delete. */
  onDelete: (() => void) | null;
}

function CurrentBadge(): JSX.Element {
  return <span className="text-xs text-primary-accent bg-primary-accent/15 px-2 py-0.5 rounded" data-testid="account-current">Current</span>;
}

export function AccountRow({ username, host, current, live, lastConnected, onSwitch, onDelete }: AccountRowProps): JSX.Element {
  return (
    <div className={`flex items-center justify-between p-4 rounded-lg bg-background border ${live ? 'border-success/30' : 'border-surface/50'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-10 w-10"><AvatarFallback className={live ? 'bg-success' : 'bg-primary'}>{username[0]?.toUpperCase() ?? '?'}</AvatarFallback></Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-foreground font-medium truncate">{username}</h4>
            {current && <CurrentBadge />}
            {live && <span className="text-xs text-success-emphasis bg-success/20 px-2 py-0.5 rounded">Active</span>}
          </div>
          <p className="text-sm text-muted-foreground truncate">{host}</p>
          {lastConnected && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Clock className="h-3 w-3" />{lastConnected}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!current && (
          <Button variant="outline" size="sm" className="border-primary-accent text-primary-accent hover:bg-primary-accent/20" onClick={onSwitch}>Switch</Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="icon" aria-label={`Delete saved account ${username} on ${host}`} className="text-destructive hover:bg-destructive/20" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
