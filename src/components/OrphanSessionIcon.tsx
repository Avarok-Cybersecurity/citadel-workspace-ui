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
}: OrphanSessionIconProps): JSX.Element => {
  const initials: string = getWorkspaceInitials(workspaceName || session.username);
  const displayName: string = session.full_name || session.username;

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
          "hover:bg-primary-accent/15 hover:border-primary-accent/30 transition-all duration-200",
          "cursor-pointer",
          shouldGlow && "border-primary-accent/50 bg-primary-accent/10"
        )}
        title={`${displayName} - ${workspaceName}`}
        data-testid={`session-button-${session.username}`}
      >
        {/* Small avatar */}
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
          "bg-primary text-primary-foreground text-xs font-bold"
        )}>
          {initials}
        </div>

        {/* Username */}
        <span className="text-xs font-medium text-foreground/80 max-w-[100px] truncate">
          {displayName}
        </span>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-1 leading-none">
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
          "bg-background border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50",
          "flex items-center justify-center",
          "reveal-on-hover",
          "cursor-pointer",
          // The visible dot stays 16px, but the HIT AREA is grown to 24px with
          // a pseudo-element: below the WCAG 2.2 target-size floor this was a
          // thumb-sized miss away from the session button underneath, which
          // switches workspaces instead of disconnecting.
          "before:absolute before:-inset-1 before:content-['']"
        )}
        // Named for THIS session. Every one of them said "Disconnect from
        // workspace", so with three workspaces open a screen-reader user heard
        // three identical destructive buttons and could drop the wrong one.
        // The same fix, with the same reasoning, is already at the tab bar's
        // close button and the member list's row actions.
        aria-label={`Disconnect from ${workspaceName} as ${displayName}`}
        title={`Disconnect from ${workspaceName}`}
        data-testid={`disconnect-button-${session.username}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
};
