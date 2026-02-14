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
      className="w-[var(--radix-dropdown-menu-trigger-width)] bg-[#252424] border border-gray-800 animate-slide-down"
      style={{ "--trigger-width": "var(--radix-dropdown-menu-trigger-width)" } as React.CSSProperties}
    >
      {groupedWorkspaces.map(([workspaceKey, workspaces]) => (
        <div key={workspaceKey} className="mb-2">
          <div className="px-2 py-1 text-xs text-gray-500 font-medium flex items-center justify-between">
            <span>{workspaceKey}</span>
            <span className="text-gray-600">{workspaces[0].serverAddress}</span>
          </div>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => onWorkspaceChange(workspace)}
              className="flex items-center gap-3 py-3 hover:bg-[#E5DEFE] transition-all cursor-pointer text-white w-full pl-3 group bg-transparent workspace-item-hover"
              disabled={isSwitching}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#6E59A5] text-white text-sm font-semibold">
                {(workspace.fullName || workspace.username || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <span className="font-semibold block group-hover:text-[#1C1D28]">
                  {workspace.fullName || workspace.username}
                </span>
                <span className="text-xs text-gray-400 group-hover:text-gray-600 flex items-center gap-1">
                  @{workspace.username} · {workspace.role || 'Member'}
                  {(workspace.role === 'Admin' || workspace.role === 'admin' || workspace.role === 'Owner' || workspace.role === 'owner') && (
                    <span title="Administrator"><Shield className="w-3 h-3 text-amber-400" /></span>
                  )}
                </span>
              </div>
              {workspace.isActive && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-glow" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => onAddAccountToWorkspace(workspaceKey, workspaces[0].serverAddress)}
            className="flex items-center gap-3 py-2 hover:bg-[#E5DEFE] transition-all cursor-pointer text-gray-400 hover:text-[#1C1D28] w-full pl-8 group bg-transparent"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Add another account</span>
          </DropdownMenuItem>
        </div>
      ))}
      <div className="border-t border-gray-700">
        <DropdownMenuItem
          onClick={onAddWorkspace}
          className="flex items-center gap-3 py-3 hover:bg-[#E5DEFE] transition-colors cursor-pointer text-white w-full pl-3 group bg-transparent"
        >
          <div className="w-8 h-8 rounded bg-[#6E59A5] flex items-center justify-center">
            <Server className="w-5 h-5" />
          </div>
          <span className="font-semibold group-hover:text-[#1C1D28]">Join New Workspace</span>
        </DropdownMenuItem>
        {availableWorkspaces.length > 0 && (
          <DropdownMenuItem
            onClick={onManageAccounts}
            className="flex items-center gap-3 py-3 hover:bg-[#E5DEFE] transition-colors cursor-pointer text-white w-full pl-3 group bg-transparent"
          >
            <div className="w-8 h-8 rounded bg-[#444A6C] flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <span className="font-semibold group-hover:text-[#1C1D28]">Manage Accounts</span>
          </DropdownMenuItem>
        )}
      </div>
    </DropdownMenuContent>
  );
}
