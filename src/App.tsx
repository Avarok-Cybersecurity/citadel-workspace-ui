import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Office } from "@/components/Office";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Messages from "./pages/Messages";
import { TestPage } from "./pages/TestPage";
import { Connect } from "./pages/Connect";
import UserDirectory from "./pages/UserDirectory";
import NotificationTest from "./pages/NotificationTest";
import WorkspaceApp from "./components/WorkspaceApp";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WorkspaceApp>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/office" element={<Office />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/directory" element={<UserDirectory />} />
            <Route path="/notifications" element={<NotificationTest />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </WorkspaceApp>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;