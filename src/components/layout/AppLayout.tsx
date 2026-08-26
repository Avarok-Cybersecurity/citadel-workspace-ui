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
      <div className="h-dvh flex w-full bg-background text-foreground overflow-hidden">
        {/*
          First tab stop, visible only once focused. The workspace renders 43
          tabbable controls and had NO landmarks at all, so reaching the content
          by keyboard meant tabbing through the entire sidebar every time, and a
          screen reader had no structure to jump by. axe does not report it:
          its `region` rule is moderate impact, under the serious/critical gate
          this suite fails on.
        */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-foreground focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          Skip to main content
        </a>

        <TopBar />

        {/* The sidebar IS the app's navigation; naming it lets a screen reader
            skip past it or jump straight to it. */}
        <Sidebar className="pt-14 bg-input border-r border-border transition-transform duration-300 ease-in-out">
          <SidebarContent>
            <nav aria-label="Workspace navigation">
              <HierarchySidebar />
              <MembersSection />
              <FilesSection />
              <AdminSettingsSection />
            </nav>
          </SidebarContent>
        </Sidebar>

        {/* tabIndex={-1} so the skip link can move focus here; without it the
            anchor scrolls the page and leaves focus back up in the sidebar. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 pt-14 pl-0 overflow-x-hidden overflow-y-auto h-full focus:outline-none"
        >
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
};