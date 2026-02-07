// HMR Test - containerized UI with polling
console.log("App.tsx loading...");

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Office } from "@/components/Office";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Messages from "./pages/Messages";
import { Connect } from "./pages/Connect";
import UserDirectory from "./pages/UserDirectory";
import WorkspaceApp from "./components/WorkspaceApp";
import { WorkspaceLoader } from "./components/ui/workspace-loader";
import { FileUploadProgress } from "./components/files/FileUploadProgress";
import { GroupChatPage } from "./pages/GroupChatPage";

console.log("App.tsx loaded, imports completed");

const queryClient = new QueryClient();

const App = () => {
  console.log("App component rendering");
  
  // Let's restore the full app now
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WorkspaceApp>
          <Toaster />
          <Sonner />
          {/* Test comment to verify Docker doesn't rebuild */}
          <BrowserRouter>
          <Routes>
            {/* Public routes that don't require workspace data */}
            <Route path="/" element={<Landing />} />
            <Route path="/connect" element={<Connect />} />
            
            {/* Protected routes that require workspace data to be loaded */}
            <Route path="/workspace" element={
              <WorkspaceLoader>
                <Office />
              </WorkspaceLoader>
            } />
            <Route path="/messages" element={
              <WorkspaceLoader>
                <Messages />
              </WorkspaceLoader>
            } />
            <Route path="/directory" element={
              <WorkspaceLoader>
                <UserDirectory />
              </WorkspaceLoader>
            } />
            <Route path="/groups/:groupId" element={
              <WorkspaceLoader>
                <GroupChatPage />
              </WorkspaceLoader>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <FileUploadProgress />
      </WorkspaceApp>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;// Container change test
