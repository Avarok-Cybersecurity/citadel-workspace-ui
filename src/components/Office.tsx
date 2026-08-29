
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { WorkspaceView } from "./workspace/WorkspaceView";
import { FileManagerContent } from "./file-manager/FileManagerContent";
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { debugLog } from '@/lib/debug-config';

export const Office: () => JSX.Element = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const params: URLSearchParams = new URLSearchParams(location.search);
  const nodeId: string | null = params.get("nodeId");
  const section: string | null = params.get("section");
  const { state } = useWorkspace();

  // Track if we've already navigated to prevent loops
  const hasNavigatedToDefault = useRef(false);

  // Auto-navigate to default node when no nodeId is selected
  // Skip if a section (e.g. "files") is explicitly active
  useEffect(() => {
    if (nodeId || section || hasNavigatedToDefault.current) return;

    // Find the default node from state
    const defaultNode = Object.values(state.nodes).find(n => n.is_default);
    if (defaultNode) {
      hasNavigatedToDefault.current = true;
      debugLog('Office', `[Office] Navigating to default node: ${defaultNode.name} (${defaultNode.id})`);
      const newParams: URLSearchParams = new URLSearchParams(location.search);
      newParams.set("nodeId", defaultNode.id);
      navigate(`/workspace?${newParams.toString()}`, { replace: true });
    }
  }, [nodeId, section, state.nodes, location.search, navigate]);

  // Reset the navigation flag when nodeId changes (user manually navigated)
  useEffect(() => {
    if (nodeId) {
      hasNavigatedToDefault.current = false;
    }
  }, [nodeId]);

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
      <WorkspaceView nodeId={nodeId} />
    </AppLayout>
  );
};
