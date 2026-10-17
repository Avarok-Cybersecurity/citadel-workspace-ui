import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Settings } from "lucide-react";
import { DisabledWithTooltip } from "@/components/ui/DisabledWithTooltip";
import { SettingsModal } from "@/components/SettingsModal";
import { useGuardedNavigate, type GuardedNavigate } from '@/hooks/use-guarded-navigate';
import { OfficeBreadcrumbs } from './OfficeBreadcrumbs';

interface OfficeLayoutProps {
  title: string;
  /** The node on screen, for the breadcrumbs; null is the workspace itself. */
  nodeId: string | null;
  isEditing: boolean;
  onEditToggle: () => void;
  onSave?: () => void;
  children: React.ReactNode;
  canEdit: boolean;
  editDeniedReason?: string;
}

export const OfficeLayout = ({
  title,
  nodeId,
  isEditing,
  onEditToggle,
  onSave,
  children,
  // No default. A permission prop that defaults to GRANTED hands the action to
  // anyone whose caller forgets to pass it, and the omission looks like nothing
  // at all at the call site. Both callers pass it explicitly (BaseOffice, twice);
  // required here so a third cannot arrive without deciding.
  canEdit,
  editDeniedReason,
}: OfficeLayoutProps): JSX.Element => {
  const navigate: GuardedNavigate = useGuardedNavigate();
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  return (
    <div className="h-[calc(100dvh-3.5rem)] overflow-hidden bg-background">
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center gap-2 px-4 py-2 border-b border-border bg-card">
          {/* The page heading is the breadcrumbs' last segment. */}
          <OfficeBreadcrumbs nodeId={nodeId} current={title} />
          <div className="flex shrink-0 items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground/80 hover:bg-primary-accent/15 hover:text-foreground"
              onClick={() => void navigate('/messages')}
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
                  data-testid="office-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={onSave}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="office-save-content"
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
                  // "Edit" is the most generic label in the app, and two specs
                  // were pressing this by it with `.first()` -- which is how a
                  // locator comes to match something else entirely and report
                  // it as a product failure. See ROBUSTNESS.md round 287.
                  data-testid="office-edit-content"
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
        tab="general"
      />
    </div>
  );
};
