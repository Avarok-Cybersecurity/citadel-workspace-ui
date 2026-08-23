import { Plus, Server, Settings, Shield } from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { StoredWorkspace } from "./useWorkspaceSwitcher";

interface WorkspaceSwitcherDropdownProps {
  availableWorkspaces: StoredWorkspace[];
  currentWorkspace: StoredWorkspace | null;
  isSwitching: boolean;
  onWorkspaceChange: (workspace: StoredWorkspace) => void;
  onAddAccountToWorkspace: (workspaceName: string, serverAddress: string) => void;
  onAddWorkspace: () => void;
  onManageAccounts: () => void;
}

export function WorkspaceSwitcherDropdown({
  availableWorkspaces,
  currentWorkspace,
  isSwitching,
  onWorkspaceChange,
  onAddAccountToWorkspace,
  onAddWorkspace,
  onManageAccounts,
}: WorkspaceSwitcherDropdownProps) {
  const groupedWorkspaces = Object.entries(
    availableWorkspaces
      .filter(workspace => workspace.id !== currentWorkspace?.id)
      .reduce((acc, workspace) => {
        const key = `${workspace.workspaceName || workspace.serverAddress}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(workspace);
        return acc;
      }, {} as Record<string, StoredWorkspace[]>)
  );

  return (
    <DropdownMenuContent
      align="start"
      sideOffset={0}
      className="w-[var(--radix-dropdown-menu-trigger-width)] bg-background border border-border shadow-xl shadow-black/40 animate-slide-down"
      style={{ "--trigger-width": "var(--radix-dropdown-menu-trigger-width)" } as React.CSSProperties}
    >
      {groupedWorkspaces.map(([workspaceKey, workspaces]) => (
        <div key={workspaceKey} className="mb-1">
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground font-semibold tracking-wider uppercase flex items-center justify-between">
            <span>{workspaceKey}</span>
            <span className="text-muted-foreground normal-case tracking-normal font-normal">{workspaces[0].serverAddress}</span>
          </div>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => onWorkspaceChange(workspace)}
              className="flex items-center gap-3 py-2.5 cursor-pointer text-foreground w-full pl-3 group bg-transparent workspace-item-hover focus:bg-purple-500/15 focus:text-foreground"
              disabled={isSwitching}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground text-sm font-semibold">
                {(workspace.fullName || workspace.username || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold block text-sm truncate">
                  {workspace.fullName || workspace.username}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  @{workspace.username} · {workspace.role || 'Member'}
                  {(workspace.role === 'Admin' || workspace.role === 'admin' || workspace.role === 'Owner' || workspace.role === 'owner') && (
                    <span title="Administrator"><Shield className="w-3 h-3 text-amber-400" /></span>
                  )}
                </span>
              </div>
              {workspace.isActive && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-glow flex-shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => onAddAccountToWorkspace(workspaceKey, workspaces[0].serverAddress)}
            className="flex items-center gap-3 py-2 cursor-pointer text-muted-foreground w-full pl-8 group bg-transparent focus:bg-purple-500/15 focus:text-foreground/80"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Add another account</span>
          </DropdownMenuItem>
        </div>
      ))}
      <div className="border-t border-border">
        <DropdownMenuItem
          onClick={onAddWorkspace}
          className="flex items-center gap-3 py-2.5 cursor-pointer text-foreground w-full pl-3 group bg-transparent focus:bg-purple-500/15 focus:text-foreground"
        >
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Server className="w-5 h-5" />
          </div>
          <span className="font-semibold text-sm">Join New Workspace</span>
        </DropdownMenuItem>
        {availableWorkspaces.length > 0 && (
          <DropdownMenuItem
            onClick={onManageAccounts}
            className="flex items-center gap-3 py-2.5 cursor-pointer text-foreground/80 w-full pl-3 group bg-transparent focus:bg-purple-500/15 focus:text-foreground"
          >
            <div className="w-8 h-8 rounded bg-card flex items-center justify-center">
              <Settings className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="font-semibold text-sm">Manage Accounts</span>
          </DropdownMenuItem>
        )}
      </div>
    </DropdownMenuContent>
  );
}
