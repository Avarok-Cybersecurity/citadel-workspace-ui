import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PreferencesDialog from "@/components/connection/PreferencesDialog";
import NotificationCenter from "@/components/notification/NotificationCenter";
import { useWorkspace } from "@/lib/workspace-context";
import { getUserInitials } from "@/lib/workspace-metadata-service";

interface TopBarProps {
  // Optional prop for backward compatibility
  currentWorkspace?: string;
}

export const TopBar = ({ currentWorkspace }: TopBarProps) => {
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { state } = useWorkspace();

  // Get workspace name from context or fallback to prop
  const workspaceName = state.workspace?.name || currentWorkspace || "Citadel Workspace";
  
  // Get the username and full name from the state
  const username = state.currentUser?.username || "User";
  const fullName = state.currentUser?.fullName || username;
  const userInitials = getUserInitials(fullName);

  const handleSettingsClick = () => {
    toast({
      title: "Settings",
      description: "Settings panel opening soon",
      className: "bg-[#343A5C] border-purple-800 text-purple-200",
    });
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-14 bg-[#252424] border-b border-gray-800 flex items-center justify-between px-4 z-50">
      <div className="flex items-center">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] md:hidden mr-4"
            onClick={toggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <WorkspaceSwitcher workspaceName={workspaceName} />
      </div>
      <div className="flex items-center space-x-2">
        <NotificationCenter />
        
        <PreferencesDialog />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="p-0 hover:bg-[#E5DEFF]">
              <Avatar className="h-8 w-8">
                <AvatarImage src="" />
                <AvatarFallback className="bg-[#444A6C] text-white">{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#343A5C] text-white border-purple-800">
            <DropdownMenuLabel>{fullName}</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-purple-800" />
            <DropdownMenuItem className="text-white hover:bg-[#444A6C] hover:text-white cursor-pointer">
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="text-white hover:bg-[#444A6C] hover:text-white cursor-pointer">
              Preferences
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-purple-800" />
            <DropdownMenuItem className="text-white hover:bg-[#444A6C] hover:text-white cursor-pointer">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
