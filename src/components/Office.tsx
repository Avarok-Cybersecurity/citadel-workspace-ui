
import { useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { WorkspaceView } from "./workspace/WorkspaceView";
import { FileManagerContent } from "./file-manager/FileManagerContent";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useEventListener } from "@/hooks";

export const Office = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const officeId = params.get("officeId");
  const roomId = params.get("roomId");
  const section = params.get("section");
  const { state } = useWorkspace();

  // Track if we've already navigated to prevent loops
  const hasNavigatedToDefault = useRef(false);

  // Handler for default office event
  const handleDefaultOffice = useCallback((data: { officeId: string; officeName: string }) => {
    // Only navigate if:
    // 1. No officeId in current URL
    // 2. Not currently showing P2P chat
    // 3. Haven't already navigated to default
    const currentParams = new URLSearchParams(location.search);
    const currentOfficeId = currentParams.get("officeId");
    const showP2P = currentParams.get("showP2P") === "true";

    if (!currentOfficeId && !showP2P && !hasNavigatedToDefault.current) {
      hasNavigatedToDefault.current = true;
      console.info(`[Office] Navigating to default office: ${data.officeName} (${data.officeId})`);

      // Build new URL with the default officeId
      const newParams = new URLSearchParams(location.search);
      newParams.set("officeId", data.officeId);
      navigate(`/workspace?${newParams.toString()}`, { replace: true });
    }
  }, [location.search, navigate]);

  // Listen for default office event
  useEventListener<{ officeId: string; officeName: string }>('offices:default-determined', handleDefaultOffice);

  // Reset the navigation flag when officeId changes (user manually navigated)
  useEffect(() => {
    if (officeId) {
      hasNavigatedToDefault.current = false;
    }
  }, [officeId]);

  // If files section is selected, show file manager
  if (section === "files") {
    return (
      <AppLayout>
        <FileManagerContent />
      </AppLayout>
    );
  }

  // For all other sections, show the integrated workspace view
  return (
    <AppLayout>
      <WorkspaceView officeId={officeId} roomId={roomId} />
    </AppLayout>
  );
};
