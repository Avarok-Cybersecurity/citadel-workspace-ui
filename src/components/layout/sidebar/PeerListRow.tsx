/**
 * PeerListRow Component
 *
 * Reusable row for displaying a P2P peer with avatar, status indicator,
 * and optional unread badge.
 */

import {
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { rowClass } from "./selected-row";

interface PeerListRowProps {
  cid: string;
  username: string;
  /**
   * True, false, or null when no poll has landed yet. Null is a real answer
   * here: this row used to write "Offline" beside every peer until the first
   * poll returned, which is an assertion about somebody who may be right there.
   */
  isOnline: boolean | null;
  isConnected: boolean;
  unreadCount?: number;
  /** Whether this is the conversation currently on screen. See active-conversation. */
  isActive?: boolean;
  onClick: () => void;
}

export function PeerListRow({
  cid,
  username,
  isOnline,
  isConnected,
  unreadCount,
  isActive = false,
  onClick,
}: PeerListRowProps): JSX.Element {
  const statusColor: "bg-success" | "bg-warning" | "bg-destructive" | "bg-muted-foreground" =
    isConnected
      ? 'bg-success'
      : isOnline === true
      ? 'bg-warning'
      : isOnline === false
      ? 'bg-destructive'
      : 'bg-muted-foreground';

  const statusLabel: string = isConnected
    ? 'Connected'
    : isOnline === true
    ? 'Online'
    : isOnline === false
    ? 'Offline'
    : 'Presence not known yet';

  return (
    <SidebarMenuItem key={cid}>
      <SidebarMenuButton
        onClick={onClick}
        data-peer-cid={cid}
        // Addressable by the name the caller knows. The P2P helpers verify a
        // connection by looking for the peer under a section headed "CONNECTED
        // PEERS" -- a heading this app deliberately stopped using when the
        // members list was given one noun, so the check could not pass and
        // reported every connection as having failed.
        data-testid={`peer-row-${username}`}
        // Announced, not only coloured. The status dot beside it already
        // carries a text equivalent for exactly this reason; a highlight that
        // exists only as a background is invisible to a screen reader and to
        // anyone who cannot separate these two purples.
        aria-current={isActive ? 'page' : undefined}
        className={`${rowClass(isActive)} h-8 py-1`}
      >
        <div className="flex items-center gap-2 w-full">
          {/* Avatar with status indicator */}
          <div className="relative w-6 h-6 flex-shrink-0">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-xs font-medium">
              {username[0]?.toUpperCase() || '?'}
            </div>
            {/* Status indicator - top-right corner */}
            <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${statusColor}`} />
            {/* Colour alone would carry the meaning, which fails WCAG 1.4.1 —
                same pairing as ParticipantTile's speaking indicator. */}
            <span className="sr-only">
              {statusLabel}
            </span>
          </div>
          {/* Username */}
          <span className="flex-1 truncate text-sm">{username}</span>
          {/* Unread count badge */}
          {unreadCount !== undefined && unreadCount > 0 && (
            <Badge className="h-5 min-w-[20px] px-1.5 bg-primary text-primary-foreground">
              {unreadCount}
              <span className="sr-only"> unread messages</span>
            </Badge>
          )}
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
