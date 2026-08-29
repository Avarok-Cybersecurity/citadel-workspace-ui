import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  GeneralSettingsTab,
  ConnectionsSettingsTab,
  AppearanceSettingsTab,
  PrivacySettingsTab,
  PermissionsSettingsTab,
} from './settings';
import { Settings, Wifi, Palette, Shield, Lock } from 'lucide-react';
import { connectionManager } from '@/lib/connection';
import type { CurrentConnectionInfo } from '@/lib/connection/types';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps): JSX.Element {
  const connectionInfo: CurrentConnectionInfo | null = connectionManager.getConnectionInfo();
  const isConnected: boolean = !!connectionInfo?.cid;

  const tabTriggerClass: "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5 text-xs rounded-lg transition-all data-[state=active]:shadow-md data-[state=active]:shadow-primary-accent/20" = "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5 text-xs rounded-lg transition-all data-[state=active]:shadow-md data-[state=active]:shadow-primary-accent/20";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] bg-background border-border shadow-2xl shadow-black/40 sm:max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl font-bold text-foreground">Settings</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">Configure your workspace preferences</p>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4 pb-2">
            {/* Each trigger's text is hidden below `sm`, which left five
                icon-only tabs with no accessible name on a phone. aria-label
                gives them one at every width. */}
            <TabsList className="grid w-full grid-cols-5 bg-input h-10 rounded-lg p-1">
              <TabsTrigger value="general" aria-label="General" className={tabTriggerClass}>
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">General</span>
              </TabsTrigger>
              <TabsTrigger
                value="connections"
                aria-label="Connections"
                className={tabTriggerClass}
                disabled={!isConnected}
                title={!isConnected ? "Connect to a workspace first" : undefined}
              >
                <Wifi className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Connect</span>
              </TabsTrigger>
              <TabsTrigger value="appearance" aria-label="Theme" className={tabTriggerClass}>
                <Palette className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Theme</span>
              </TabsTrigger>
              <TabsTrigger value="privacy" aria-label="Privacy" className={tabTriggerClass}>
                <Shield className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Privacy</span>
              </TabsTrigger>
              <TabsTrigger
                value="permissions"
                aria-label="Permissions"
                className={tabTriggerClass}
                disabled={!isConnected}
                title={!isConnected ? "Connect to a workspace first" : undefined}
              >
                <Lock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Perms</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <TabsContent value="general" className="mt-4 min-h-[300px]">
              <GeneralSettingsTab />
            </TabsContent>

            <TabsContent value="connections" className="mt-4 min-h-[300px]">
              <ConnectionsSettingsTab />
            </TabsContent>

            <TabsContent value="appearance" className="mt-4 min-h-[300px]">
              <AppearanceSettingsTab />
            </TabsContent>

            <TabsContent value="privacy" className="mt-4 min-h-[300px]">
              <PrivacySettingsTab />
            </TabsContent>

            <TabsContent value="permissions" className="mt-4 min-h-[300px]">
              <PermissionsSettingsTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
