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
    serverAddress,
    serverPassword,
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
            // flex-1 min-w-0, not w-full. This button has a sibling — the sidebar
            // toggle — so `w-full` resolved to 100% of the WHOLE header group
            // while the button still started after that toggle, overhanging its
            // container by exactly the toggle's width. At 375px that pushed the
            // chevron 56px into the controls on the right, painting it over
            // them. flex-1 asks for the space that is actually left.
            className="flex items-center gap-3 py-2 hover:bg-primary-accent/10 transition-colors rounded-md flex-1 min-w-0 group bg-transparent pl-3"
            disabled={isSwitching}
          >
            {isInitials ? (
              <div className="w-8 h-8 shrink-0 rounded flex items-center justify-center bg-primary text-primary-foreground text-sm font-semibold">
                {workspaceLogo || getWorkspaceInitials(workspaceName || currentWorkspace?.username || "W")}
              </div>
            ) : (
              <img
                src={workspaceLogo || ""}
                alt={workspaceName || currentWorkspace?.username || "Workspace"}
                className="w-8 h-8 shrink-0 rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="flex-1 min-w-0 text-left">
              <span className="font-semibold text-foreground block truncate group-hover:text-foreground">
                {workspaceName || currentWorkspace?.workspaceName || "Select Workspace"}
              </span>
              {currentWorkspace && (
                <span className="block truncate text-xs text-muted-foreground group-hover:text-muted-foreground">
                  {currentWorkspace.fullName || currentWorkspace.username}
                </span>
              )}
            </div>
            {isSwitching ? (
              <div className="w-5 h-5 shrink-0 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
            ) : (
              <ChevronRight
                className={cn(
                  // shrink-0 so a long workspace name squeezes the name, which
                  // truncates, rather than this arrow, which cannot. (It is not
                  // what fixed the 375px spill — see the button's own comment.)
                  "w-5 h-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-transform duration-300 mr-2",
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
              onCancel={() => setIsAddingWorkspace(false)}
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
              serverAddress={targetWorkspaceForNewAccount?.serverAddress ?? serverAddress}
              serverPassword={serverPassword}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WorkspaceSwitcher;
