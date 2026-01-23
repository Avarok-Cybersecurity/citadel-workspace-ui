import { Button } from "@/components/ui/button";
import { MessageSquare, Search, Settings, Share2, Files } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { officeRooms } from "../layout/sidebar/RoomsSection";
import { FileUploadButton } from "@/components/files/FileUploadButton";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { buildWorkspacePath } from "@/lib/workspace-navigation";
import { DisabledWithTooltip } from "@/components/ui/DisabledWithTooltip";

interface OfficeLayoutProps {
  title: string;
  isEditing: boolean;
  onEditToggle: () => void;
  onSave?: () => void;
  children: React.ReactNode;
  canEdit?: boolean;
  editDeniedReason?: string;
}

const officeNames = {
  company: "Company",
  marketing: "PR/Marketing",
  hr: "Human Resources"
};

export const OfficeLayout = ({
  title,
  isEditing,
  onEditToggle,
  onSave,
  children,
  canEdit = true, // Default to true for backward compatibility
  editDeniedReason
}: OfficeLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useWorkspace();
  const currentSection = new URLSearchParams(location.search).get("section") || "company";
  const currentRoom = new URLSearchParams(location.search).get("room");
  const officeName = officeNames[currentSection as keyof typeof officeNames];
  
  const rooms = officeRooms[currentSection as keyof typeof officeRooms] || [];
  const currentRoomData = rooms.find(room => room.id === currentRoom);
  const roomName = currentRoomData ? ` → ${currentRoomData.name}` : "";

  // Determine entity type and ID for file uploads
  const entityType = currentRoom ? 'room' : 'office';
  const entityId = currentRoom || currentSection || 'workspace';

  const handleOfficeClick = () => {
    const params = new URLSearchParams(location.search);
    params.delete("room");
    navigate(buildWorkspacePath(params));
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden bg-[#444A6C]">
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center px-4 py-2 border-b border-gray-800 bg-[#343A5C]">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-white hidden md:block">
              <button 
                onClick={handleOfficeClick}
                className="hover:text-[#E5DEFF] transition-colors"
              >
                {officeName}
              </button>
              <span className="text-[#E5DEFF]">{roomName}</span>
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C]"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C]"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C]"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C]"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <FileUploadButton
              entityType={entityType as 'office' | 'room' | 'workspace'}
              entityId={entityId}
              className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C]"
            />
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
    </div>
  );
};
