import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TopBar } from "./sidebar/TopBar";
import { HierarchySidebar } from "./sidebar/HierarchySidebar";
import { MembersSection } from "./sidebar/MembersSection";
import { FilesSection } from "./sidebar/FilesSection";
import { AdminSettingsSection } from "./sidebar/AdminSettingsSection";

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const [currentWorkspace] = useState("AVAROK CYBERSECURITY");

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full bg-[#444A6C] text-white overflow-hidden">
        <TopBar currentWorkspace={currentWorkspace} />

        <Sidebar className="pt-14 bg-[#262C4A]/95 transition-transform duration-300 ease-in-out">
          <SidebarContent>
            <HierarchySidebar />
            <MembersSection />
            <FilesSection />
            <AdminSettingsSection />
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 pt-14 pl-0 overflow-x-hidden overflow-y-auto h-full">
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
};