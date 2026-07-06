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
  return (
    <SidebarProvider>
      <div className="h-screen flex w-full bg-[#1C1D28] text-white overflow-hidden">
        <TopBar />

        <Sidebar className="pt-14 bg-[#131420] border-r border-[#2D3548] transition-transform duration-300 ease-in-out">
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