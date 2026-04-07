import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildWorkspacePath } from "@/lib/workspace-navigation";
import { DisabledWithTooltip } from "@/components/ui/DisabledWithTooltip";
import { SettingsModal } from "@/components/SettingsModal";

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
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden bg-[#1C1D28]">
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center px-4 py-2 border-b border-[#2D3548] bg-[#232536]">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-white hidden md:block">
              <button
                onClick={handleNavigateUp}
                className="hover:text-purple-300 transition-colors"
              >
                {title}
              </button>
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-300 hover:bg-purple-500/15 hover:text-white"
              onClick={() => navigate('/messages')}
              title="Messages"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-300 hover:bg-purple-500/15 hover:text-white"
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  className="text-gray-300 hover:bg-purple-500/15 hover:text-white"
                  onClick={onEditToggle}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onSave}
                  className="bg-purple-600 text-white hover:bg-purple-700"
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
                  variant="outline"
                  className="border-purple-500/50 text-purple-300 hover:bg-purple-500/15 hover:text-white hover:border-purple-400"
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
