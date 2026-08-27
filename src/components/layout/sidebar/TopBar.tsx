import { Menu, LogOut, ArrowLeft, Download } from "lucide-react";
import { isPrivilegedRole } from '@/lib/role-predicate';
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useInstallAction } from "@/components/pwa/use-install-action";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import NotificationCenter from "@/components/notification/NotificationCenter";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { SettingsModal } from "@/components/SettingsModal";
import { getUserInitials } from "@/lib/workspace-metadata-service";
import { LeaderIndicator } from "@/components/ui/leader-indicator";
import { isDiagnosticsUiEnabled } from "@/lib/debug-config";
import { connectionManager } from "@/lib/connection";
import { getSelectedUser } from "@/lib/tab-context";
import { useState, useEffect } from "react";
import { ExitConfirmModal } from "@/components/ExitConfirmModal";
import { ProfileModal } from "@/components/settings/ProfileModal";
import { DisconnectLoadingModal } from "@/components/LoadingModal";
import { cn } from "@/lib/utils";
import { useSessionExit } from './use-session-exit';

interface TopBarProps {
  // Optional prop for backward compatibility
  currentWorkspace?: string;
}

export const TopBar = ({ currentWorkspace }: TopBarProps) => {
  // Installing was only offered on the landing page, so anyone already signed
  // in had no way to it except the browser's own omnibox icon, which is easy to
  // miss and absent on some platforms. Renders nothing unless the browser has
  // actually offered a prompt and we are not already the installed copy.
  const { canInstall, installNow } = useInstallAction();
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const { state } = useWorkspace();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const {
    showDisconnectModal, disconnectStatus, disconnectError,
    handleExit, handleSignOut, handleDisconnectComplete,
  } = useSessionExit();

  // Get workspace name from context or fallback to prop
  const workspaceName = state.workspace?.name || currentWorkspace || "Citadel Workspace";

  // Fallback identity from tab-context — the orphan-claim path doesn't
  // persist a stored-session row, so without this fallback the TopBar
  // renders "U"/"User" even though tab-context knows the username.
  const [sessionFallback, setSessionFallback] = useState<{ username: string; fullName?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const tab = await getSelectedUser();
      if (cancelled) return;
      if (tab?.selectedUsername) { setSessionFallback({ username: tab.selectedUsername }); return; }
      const session = await connectionManager.getTabSelectedSession();
      if (!cancelled) setSessionFallback(session?.username ? { username: session.username, fullName: session.fullName } : null);
    })();
    return () => { cancelled = true; };
  }, [state.currentUser?.username]);

  const username = state.currentUser?.username || sessionFallback?.username || "User";
  const name = state.currentUser?.name || sessionFallback?.fullName || username;
  const userInitials = getUserInitials(name);
  const avatarUrl = state.currentUser?.avatarUrl;


  const userRole = state.currentUser?.role;
  const isAdmin = isPrivilegedRole(userRole);


  return (
    // <header>, not a div: this is the app's banner, and it completes the
    // landmark set alongside <nav> and <main> in AppLayout. Without it a screen
    // reader has no way to jump to the workspace switcher or the user menu.
    <header className="fixed top-0 left-0 right-0 h-14 bg-background border-b border-border flex items-center justify-between pr-4 z-50">
      {/*
        min-w-0 so this group can shrink. Flex children default to
        min-width:auto, meaning they refuse to go narrower than their content —
        so a long workspace name pushed the group on the right, avatar included,
        clean off a 375px viewport. That put Profile, Settings and Sign out out
        of reach entirely on a phone.
      */}
      <div className="flex items-center min-w-0 flex-1">
        {/*
          Shown at every width, not just on mobile. The toggle was gated behind
          `isMobile` AND `md:hidden`, so on a desktop viewport there was no way to
          collapse the sidebar at all — even though useSidebar().toggleSidebar and
          the Sidebar's own collapse behaviour were already wired up. Reclaiming
          that horizontal space matters most on the wide screens where the control
          was missing.
        */}
        <Button
          variant="ghost"
          size="icon"
          // shrink-0 for the same reason the right-hand group has it: `size="icon"`
          // asks for 40x40, but a flex child yields before its siblings do, and
          // at 375px this one was squeezed to 16px wide — a 40px-tall sliver.
          // On a phone this is THE control that opens navigation, so it is the
          // last thing that should give way.
          className="shrink-0 text-foreground hover:bg-primary-accent/15 hover:text-foreground mr-4"
          onClick={toggleSidebar}
          aria-label={isMobile ? 'Toggle navigation menu' : 'Toggle sidebar'}
          title={isMobile ? 'Toggle navigation menu' : 'Toggle sidebar'}
          data-testid="sidebar-toggle"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <WorkspaceSwitcher workspaceName={workspaceName} />
      </div>
      {/* shrink-0: these controls are the way out of the app and must never be
          what gives way when space runs short. */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        {/* Internal multi-tab state — hidden from end users; see isDiagnosticsUiEnabled. */}
        {isDiagnosticsUiEnabled() && <LeaderIndicator />}
        <NotificationCenter />


        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Named on the BUTTON, not left to the avatar inside it. The
                initials fallback is unmounted by Radix the moment a real
                picture loads, so a name that lives only in that fallback
                disappears exactly when the user personalises their account.
                `title` was admin-only, so non-admins had nothing at all. */}
            <Button
              variant="ghost"
              size="icon"
              className="p-0 hover:bg-primary-accent/15"
              aria-label={isAdmin ? `Account menu for ${username} (workspace administrator)` : `Account menu for ${username}`}
              title={isAdmin ? "Workspace Administrator" : undefined}
              data-testid="user-avatar-button"
            >
              <Avatar className={cn(
                "h-8 w-8",
                isAdmin && "ring-2 ring-warning ring-offset-1 ring-offset-background"
              )}>
                {/* NOT decorative. This avatar is the entire content of the
                    account-menu button, and Radix unmounts the initials
                    fallback once a real picture loads — so setting a profile
                    picture used to leave the only route to Profile, Settings
                    and Sign out announced as "button". The button also carries
                    its own aria-label, which is what survives if the image
                    fails to load at all. */}
                <AvatarImage src={avatarUrl || ""} alt="" />
                <AvatarFallback className="bg-surface text-foreground">{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-background text-foreground border-border shadow-xl shadow-black/40">
            <DropdownMenuLabel className="text-foreground/80 text-xs font-normal">{name}</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="text-foreground cursor-pointer focus:bg-primary-accent/15 focus:text-foreground"
              onClick={() => setShowProfileModal(true)}
            >
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-foreground cursor-pointer focus:bg-primary-accent/15 focus:text-foreground"
              onClick={() => setShowSettingsModal(true)}
            >
              Settings
            </DropdownMenuItem>
            {canInstall && (
              <DropdownMenuItem
                className="text-foreground cursor-pointer gap-2 focus:bg-primary-accent/15 focus:text-foreground"
                onClick={installNow}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Install app
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="text-muted-foreground cursor-pointer gap-2 focus:bg-primary-accent/15 focus:text-foreground"
              onClick={() => setShowExitConfirm(true)}
            >
              <ArrowLeft className="h-4 w-4" />
              Exit to Landing
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive-emphasis cursor-pointer gap-2 focus:bg-destructive/10 focus:text-destructive-emphasis"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Exit confirmation modal */}
      <ExitConfirmModal
        open={showExitConfirm}
        onOpenChange={setShowExitConfirm}
        onConfirm={handleExit}
        userName={name}
        workspaceName={workspaceName}
      />

      {/* Profile settings modal */}
      <ProfileModal
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
      />

      {/* Disconnect loading modal */}
      <DisconnectLoadingModal
        open={showDisconnectModal}
        status={disconnectStatus}
        workspaceName={workspaceName}
        errorMessage={disconnectError}
        onComplete={handleDisconnectComplete}
      />

      {/* Settings modal */}
      <SettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
      />
    </header>
  );
};
