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

  return (
    <div className="relative group">
      {/* Main workspace icon */}
      <button
        onClick={onNavigate}
        className={cn(
          "w-12 h-12 rounded flex items-center justify-center",
          "bg-[#6E59A5] text-white font-semibold text-lg",
          "hover:scale-105 transition-all duration-200",
          "cursor-pointer",
          shouldGlow && "animate-[glow-pulse_2s_ease-in-out_infinite]"
        )}
        style={
          shouldGlow
            ? {
                boxShadow: "0 0 8px rgba(139, 92, 246, 0.8)",
              }
            : undefined
        }
        title={`${session.full_name || session.username} - ${workspaceName}`}
      >
        {initials}
      </button>

      {/* Notification badge - top right */}
      {unreadCount > 0 && (
        <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-1 pointer-events-none">
          {unreadCount > 9 ? '9+' : unreadCount}
        </div>
      )}

      {/* Disconnect button - positioned on bottom-right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDisconnect();
        }}
        className={cn(
          "absolute -bottom-1 -right-1 w-5 h-5 rounded-full",
          "bg-red-500 hover:bg-red-600 text-white",
          "flex items-center justify-center",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          "shadow-md hover:shadow-lg",
          "cursor-pointer"
        )}
        title="Disconnect from workspace"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Workspace name tooltip on hover */}
      <div
        className={cn(
          "absolute top-full mt-2 left-1/2 -translate-x-1/2",
          "bg-gray-900 text-white text-xs px-2 py-1 rounded",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
          "pointer-events-none whitespace-nowrap z-50"
        )}
      >
        <div className="font-semibold">{workspaceName}</div>
        <div className="text-gray-400">{session.full_name || session.username}</div>
      </div>
    </div>
  );
};
