import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildWorkspacePath } from "@/lib/workspace-navigation";
import { DisabledWithTooltip } from "@/components/ui/DisabledWithTooltip";
import { SettingsModal } from "@/components/SettingsModal";
import type { NavigateFunction } from 'react-router';

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
}: OfficeLayoutProps): JSX.Element => {
  const location = useLocation();
  const navigate: NavigateFunction = useNavigate();
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const handleNavigateUp = (): void => {
    const params: URLSearchParams = new URLSearchParams(location.search);
    params.delete("nodeId");
    navigate(buildWorkspacePath(params));
  };

  return (
    <div className="h-[calc(100dvh-3.5rem)] overflow-hidden bg-background">
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center px-4 py-2 border-b border-border bg-card">
          <div className="flex items-center space-x-4">
            {/* sr-only rather than `hidden` below md: `display:none` takes it out of
                the accessibility tree, so on a phone the page had no h1 at all and
                the document's own heading became the top level instead. Which
                element was the page heading depended on the viewport. */}
            <h1 className="text-xl font-semibold text-foreground sr-only md:not-sr-only md:block">
              <button
                onClick={handleNavigateUp}
                className="hover:text-primary-accent transition-colors"
              >
                {title}
              </button>
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground/80 hover:bg-primary-accent/15 hover:text-foreground"
              onClick={() => navigate('/messages')}
              title="Messages"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground/80 hover:bg-primary-accent/15 hover:text-foreground"
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  className="text-foreground/80 hover:bg-primary-accent/15 hover:text-foreground"
                  onClick={onEditToggle}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onSave}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
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
                  className="border-primary-accent/50 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground hover:border-primary-accent"
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
