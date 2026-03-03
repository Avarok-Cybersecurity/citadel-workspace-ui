import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ServerConnect } from "@/components/ServerConnect";
import { SecuritySettings } from "@/components/SecuritySettings";
import { Join } from "@/components/Join";
import { getWorkspaceInitials } from "@/lib/workspace-metadata-service";
import { useWorkspaceSwitcher } from "./useWorkspaceSwitcher";
import { WorkspaceSwitcherDropdown } from "./WorkspaceSwitcherDropdown";

interface WorkspaceSwitcherProps {
  workspaceName?: string;
}

export const WorkspaceSwitcher = ({ workspaceName }: WorkspaceSwitcherProps) => {
  const {
    availableWorkspaces,
    currentWorkspace,
    isOpen,
    setIsOpen,
    isAddingWorkspace,
    setIsAddingWorkspace,
    currentStep,
    workspaceLogo,
    isInitials,
    isSwitching,
    targetWorkspaceForNewAccount,
    setTargetWorkspaceForNewAccount,
    handleWorkspaceChange,
    handleAddWorkspace,
    handleAddAccountToWorkspace,
    handleManageAccounts,
    handleNext,
    handleBack,
  } = useWorkspaceSwitcher(workspaceName);

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-3 py-2 hover:bg-[#E5DEFE] transition-colors rounded-md w-full group bg-transparent pl-3"
            disabled={isSwitching}
          >
            {isInitials ? (
              <div className="w-8 h-8 rounded flex items-center justify-center bg-[#6E59A5] text-white text-sm font-semibold">
                {workspaceLogo || getWorkspaceInitials(workspaceName || currentWorkspace?.username || "W")}
              </div>
            ) : (
              <img
                src={workspaceLogo || ""}
                alt={workspaceName || currentWorkspace?.username || "Workspace"}
                className="w-8 h-8 rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="flex-1 text-left">
              <span className="font-semibold text-white block group-hover:text-[#1C1D28]">
                {workspaceName || currentWorkspace?.workspaceName || "Select Workspace"}
              </span>
              {currentWorkspace && (
                <span className="text-xs text-gray-400 group-hover:text-gray-600">
                  {currentWorkspace.fullName || currentWorkspace.username}
                </span>
              )}
            </div>
            {isSwitching ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <ChevronRight
                className={cn(
                  "w-5 h-5 text-white group-hover:text-[#1C1D28] transition-transform duration-300 mr-2",
                  isOpen && "rotate-90"
                )}
              />
            )}
          </button>
        </DropdownMenuTrigger>
        <WorkspaceSwitcherDropdown
          availableWorkspaces={availableWorkspaces}
          currentWorkspace={currentWorkspace}
          isSwitching={isSwitching}
          onWorkspaceChange={handleWorkspaceChange}
          onAddAccountToWorkspace={handleAddAccountToWorkspace}
          onAddWorkspace={handleAddWorkspace}
          onManageAccounts={handleManageAccounts}
        />
      </DropdownMenu>

      <Dialog open={isAddingWorkspace} onOpenChange={(open) => {
        setIsAddingWorkspace(open);
        if (!open) {
          setTargetWorkspaceForNewAccount(null);
        }
      }}>
        <DialogContent className="p-0 bg-transparent border-none max-w-xl">
          {currentStep === "connect" && (
            <ServerConnect
              onNext={handleNext}
              defaultServer={targetWorkspaceForNewAccount?.serverAddress}
              title={targetWorkspaceForNewAccount ?
                `Connect to ${targetWorkspaceForNewAccount.workspaceName}` :
                undefined
              }
            />
          )}
          {currentStep === "security" && (
            <SecuritySettings onNext={handleNext} onBack={handleBack} />
          )}
          {currentStep === "join" && (
            <Join
              onNext={handleNext}
              onBack={handleBack}
              defaultWorkspace={targetWorkspaceForNewAccount?.workspaceName}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkspaceSwitcher;
