console.log("App-minimal.tsx loading...");

import React from 'react';
// Test imports one by one
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Office } from "@/components/Office";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Messages from "./pages/Messages";
import { TestPage } from "./pages/TestPage";
import { Connect } from "./pages/Connect";
import UserDirectory from "./pages/UserDirectory";
import NotificationTest from "./pages/NotificationTest";
import WorkspaceApp from "./components/WorkspaceApp";
import { WorkspaceLoader } from "./components/ui/workspace-loader";

const queryClient = new QueryClient();

const App = () => {
  console.log("App-minimal component rendering");
  
  // Test step by step - now add WorkspaceApp
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WorkspaceApp>
          <div style={{ padding: '20px', color: 'red', fontFamily: 'monospace' }}>
            <h1>Testing WorkspaceApp</h1>
            <p>Step 2: WorkspaceApp added - this will initialize WASM services.</p>
            <p>If this hangs, WorkspaceApp is the issue.</p>
          </div>
        </WorkspaceApp>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

console.log("App-minimal.tsx loaded successfully");

export default App;