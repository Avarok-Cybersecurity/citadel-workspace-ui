import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveSession } from "@/types/session-types";
import { getWorkspaceInitials } from "@/lib/workspace-metadata-service";

interface OrphanSessionIconProps {
  session: ActiveSession;
  workspaceName: string;
  onNavigate: () => void;
  onDisconnect: () => void;
  shouldGlow?: boolean;
  unreadCount?: number;
}

export const OrphanSessionIcon = ({
  session,
  workspaceName,
  onNavigate,
  onDisconnect,
  shouldGlow = false,
  unreadCount = 0,
}: OrphanSessionIconProps) => {
  const initials = getWorkspaceInitials(workspaceName || session.username);
  const displayName = session.full_name || session.username;

  return (
    <div
      className="relative group flex-shrink-0"
      data-testid={`session-icon-${session.username}`}
      data-session-cid={session.cid}
    >
      {/* Session chip - compact horizontal layout */}
      <button
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 h-8 pl-1 pr-3 rounded-full",
          "bg-card border border-border text-foreground",
          "hover:bg-purple-500/15 hover:border-purple-500/30 transition-all duration-200",
          "cursor-pointer",
          shouldGlow && "border-purple-500/50 bg-purple-500/10"
        )}
        title={`${displayName} - ${workspaceName}`}
        data-testid={`session-button-${session.username}`}
      >
        {/* Small avatar */}
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
          "bg-primary text-primary-foreground text-[10px] font-bold"
        )}>
          {initials}
        </div>

        {/* Username */}
        <span className="text-xs font-medium text-foreground/80 max-w-[100px] truncate">
          {displayName}
        </span>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-red-500 text-foreground text-[10px] font-bold px-1 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Disconnect X - appears on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDisconnect();
        }}
        className={cn(
          "absolute -top-1 -right-1 w-4 h-4 rounded-full",
          "bg-background border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/50",
          "flex items-center justify-center",
          "opacity-0 group-hover:opacity-100 transition-all duration-200",
          "cursor-pointer"
        )}
        title="Disconnect from workspace"
        data-testid={`disconnect-button-${session.username}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
};
