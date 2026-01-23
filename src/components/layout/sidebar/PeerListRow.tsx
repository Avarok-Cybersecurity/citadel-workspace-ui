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

interface PeerListRowProps {
  cid: string;
  username: string;
  isOnline: boolean;
  isConnected: boolean;
  unreadCount?: number;
  onClick: () => void;
}

export function PeerListRow({
  cid,
  username,
  isOnline,
  isConnected,
  unreadCount,
  onClick,
}: PeerListRowProps) {
  const statusColor = isConnected
    ? 'bg-green-500'
    : isOnline
    ? 'bg-yellow-500'
    : 'bg-red-500';

  return (
    <SidebarMenuItem key={cid}>
      <SidebarMenuButton
        onClick={onClick}
        className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-colors h-8 py-1"
      >
        <div className="flex items-center gap-2 w-full">
          {/* Avatar with status indicator */}
          <div className="relative w-6 h-6 flex-shrink-0">
            <div className="w-6 h-6 rounded-full bg-[#6E59A5] flex items-center justify-center text-xs font-medium">
              {username[0]?.toUpperCase() || '?'}
            </div>
            {/* Status indicator - top-right corner */}
            <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#262C4A] ${statusColor}`} />
          </div>
          {/* Username */}
          <span className="flex-1 truncate text-sm">{username}</span>
          {/* Unread count badge */}
          {unreadCount !== undefined && unreadCount > 0 && (
            <Badge className="h-5 min-w-[20px] px-1.5 bg-[#6E59A5] text-white">
              {unreadCount}
            </Badge>
          )}
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
