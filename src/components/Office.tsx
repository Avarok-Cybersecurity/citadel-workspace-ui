
import { useLocation } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { WorkspaceView } from "./workspace/WorkspaceView";
import { FileManagerContent } from "./file-manager/FileManagerContent";
import { useWorkspace } from "@/lib/workspace-context";

export const Office = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const officeId = params.get("officeId");
  const roomId = params.get("roomId");
  const section = params.get("section");
  const { state } = useWorkspace();

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

