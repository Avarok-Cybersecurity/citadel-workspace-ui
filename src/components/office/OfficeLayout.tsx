import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Search, Settings, Share2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildWorkspacePath } from "@/lib/workspace-navigation";
import { DisabledWithTooltip } from "@/components/ui/DisabledWithTooltip";
import { SettingsModal } from "@/components/SettingsModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface OfficeLayoutProps {
  title: string;
  isEditing: boolean;
  onEditToggle: () => void;
  onSave?: () => void;
  children: React.ReactNode;
  canEdit?: boolean;
  editDeniedReason?: string;
}

export const OfficeLayout = ({
  title,
  isEditing,
  onEditToggle,
  onSave,
  children,
  canEdit = true,
  editDeniedReason,
}: OfficeLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const handleNavigateUp = () => {
    const params = new URLSearchParams(location.search);
    params.delete("nodeId");
    navigate(buildWorkspacePath(params));
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden bg-[#444A6C]">
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center px-4 py-2 border-b border-gray-800 bg-[#343A5C]">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-white hidden md:block">
              <button
                onClick={handleNavigateUp}
                className="hover:text-[#E5DEFF] transition-colors"
              >
                {title}
              </button>
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C]"
              onClick={() => navigate('/messages')}
              title="Messages"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-gray-500 cursor-not-allowed opacity-50"
                    aria-disabled="true"
                    onClick={(e) => e.preventDefault()}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Search — coming soon</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-gray-500 cursor-not-allowed opacity-50"
                    aria-disabled="true"
                    onClick={(e) => e.preventDefault()}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Share — coming soon</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C]"
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            {isEditing ? (
              <>
                <Button
                  variant="secondary"
                  className="bg-[#E5DEFF] text-[#343A5C] hover:bg-[#F1F0FB] hover:text-[#262C4A]"
                  onClick={onEditToggle}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onSave}
                  className="bg-[#E5DEFF] text-[#343A5C] hover:bg-[#F1F0FB] hover:text-[#262C4A]"
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <DisabledWithTooltip
                disabled={!canEdit}
                tooltip={editDeniedReason || "You don't have permission to edit this content"}
              >
                <Button
                  variant="secondary"
                  className="bg-[#E5DEFF] text-[#343A5C] hover:bg-[#F1F0FB] hover:text-[#262C4A]"
                  onClick={canEdit ? onEditToggle : undefined}
                >
                  Edit
                </Button>
              </DisabledWithTooltip>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>

      {/* Settings modal triggered from content header */}
      <SettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
      />
    </div>
  );
};
