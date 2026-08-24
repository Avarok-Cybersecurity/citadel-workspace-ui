import { lazy, Suspense } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import WorkspaceApp from "./components/WorkspaceApp";
import { WorkspaceLoader } from "./components/ui/workspace-loader";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { RouteFallback } from "./components/RouteFallback";
import { PwaUpdatePrompt } from "./components/pwa/PwaUpdatePrompt";
import { OfflineBanner } from "./components/pwa/OfflineBanner";

// Landing is the route almost every session starts on, so it is imported eagerly:
// code-splitting it would only add a network round trip before first paint.
import Landing from "./pages/Landing";

/**
 * Every other route is split out. Nothing here was split before, so a visitor to
 * the landing page downloaded the workspace shell, the group chat page, the file
 * manager and the collaborative editor (TipTap + Yjs + ProseMirror) before it
 * could render — none of which that page uses.
 */
const Office = lazy(() =>
  import("@/components/Office").then(m => ({ default: m.Office }))
);
const Messages = lazy(() => import("./pages/Messages"));
const Connect = lazy(() =>
  import("./pages/Connect").then(m => ({ default: m.Connect }))
);
const UserDirectory = lazy(() => import("./pages/UserDirectory"));
const GroupChatPage = lazy(() =>
  import("./pages/GroupChatPage").then(m => ({ default: m.GroupChatPage }))
);
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => {
  return (
    <AppErrorBoundary>
      {/*
        next-themes was already a dependency and ui/sonner.tsx already called
        useTheme() — with no provider mounted, so it always read "system" and
        toasts could render light inside a permanently-dark app.

        defaultTheme="dark" keeps the product looking exactly as it does today;
        the difference is that light is now reachable rather than theoretical.
        `attribute="class"` matches tailwind.config's darkMode: ["class"], and
        disableTransitionOnChange stops every transition on the page firing at
        once when the class flips.
      */}
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
        storageKey="citadel:theme"
      >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WorkspaceApp>
            {/*
              One toast system. The app used to mount shadcn's <Toaster /> AND
              <Sonner /> simultaneously, so a notification's appearance depended
              on which feature raised it. useToast() now renders through Sonner.
            */}
            <Sonner />
            <PwaUpdatePrompt />
            <OfflineBanner />
            {/*
              Opt into the v7 behaviours now. Both were logging deprecation
              warnings on every boot; adopting them here means the eventual
              react-router v7 upgrade is a version bump rather than a behaviour
              change, and the console stays clean enough that a real warning
              is noticeable.
            */}
            <BrowserRouter
              future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
            >
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  {/* Public routes that don't require workspace data */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/connect" element={<Connect />} />

                  {/* Protected routes that require workspace data to be loaded */}
                  <Route
                    path="/workspace"
                    element={
                      <WorkspaceLoader>
                        <Office />
                      </WorkspaceLoader>
                    }
                  />
                  <Route
                    path="/messages"
                    element={
                      <WorkspaceLoader>
                        <Messages />
                      </WorkspaceLoader>
                    }
                  />
                  <Route
                    path="/directory"
                    element={
                      <WorkspaceLoader>
                        <UserDirectory />
                      </WorkspaceLoader>
                    }
                  />
                  <Route
                    path="/groups/:groupId"
                    element={
                      <WorkspaceLoader>
                        <GroupChatPage />
                      </WorkspaceLoader>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </WorkspaceApp>
        </TooltipProvider>
      </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
};

export default App;
