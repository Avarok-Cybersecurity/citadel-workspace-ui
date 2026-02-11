
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { WorkspaceView } from "./workspace/WorkspaceView";
import { FileManagerContent } from "./file-manager/FileManagerContent";
import { useWorkspace } from '@/contexts/WorkspaceContext';

export const Office = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const nodeId = params.get("nodeId");
  const section = params.get("section");
  const { state } = useWorkspace();

  // Track if we've already navigated to prevent loops
  const hasNavigatedToDefault = useRef(false);

  // Auto-navigate to default node when no nodeId is selected
  useEffect(() => {
    if (nodeId || hasNavigatedToDefault.current) return;

    // Find the default node from state
    const defaultNode = Object.values(state.nodes).find(n => n.is_default);
    if (defaultNode) {
      hasNavigatedToDefault.current = true;
      console.info(`[Office] Navigating to default node: ${defaultNode.name} (${defaultNode.id})`);
      const newParams = new URLSearchParams(location.search);
      newParams.set("nodeId", defaultNode.id);
      navigate(`/workspace?${newParams.toString()}`, { replace: true });
    }
  }, [nodeId, state.nodes, location.search, navigate]);

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
