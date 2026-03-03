import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  GeneralSettingsTab,
  ConnectionsSettingsTab,
  PermissionsSettingsTab,
} from './settings';
import { Settings, Wifi, Lock } from 'lucide-react';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-[#282A42] border-[#3D3F5A]">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Settings</DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure your workspace preferences
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="grid w-full grid-cols-3 bg-[#1a1b26] h-12">
            <TabsTrigger
              value="general"
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger
              value="connections"
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Wifi className="h-4 w-4" />
              <span className="hidden sm:inline">Connections</span>
            </TabsTrigger>
            <TabsTrigger
              value="permissions"
              className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Permissions</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <GeneralSettingsTab />
          </TabsContent>

          <TabsContent value="connections" className="mt-6">
            <ConnectionsSettingsTab />
          </TabsContent>

          <TabsContent value="permissions" className="mt-6">
            <PermissionsSettingsTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
