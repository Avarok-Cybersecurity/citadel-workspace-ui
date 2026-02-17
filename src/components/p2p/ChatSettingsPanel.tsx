import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Settings,
  FileText,
  Sliders,
  BarChart3,
  Bell,
  Eye,
  MessageSquare
} from 'lucide-react';
import { useChatSettings } from './useChatSettings';
import { ChatSettingsFileTab } from './ChatSettingsFileTab';

interface ChatSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  peerCid: string;
  peerName: string;
}

export function ChatSettingsPanel({
  isOpen,
  onClose,
  peerCid,
  peerName,
}: ChatSettingsPanelProps) {
  const {
    activeOuterTab,
    setActiveOuterTab,
    activeFileTab,
    setActiveFileTab,
    settings,
    maxFileSizeMb,
    revfsQuotaMb,
    defaultMaxMb,
    formatBytes,
    handleAutoAcceptChange,
    handleMaxFileSizeChange,
    handleTransferModeChange,
    handleAllowRevfsChange,
    handleRevfsQuotaChange,
  } = useChatSettings(isOpen, peerCid);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#1C1D28] border-[#262C4A] text-white sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-[#6E59A5]/20">
              <Settings className="h-5 w-5 text-purple-400" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              Chat Settings
            </DialogTitle>
          </div>
          <DialogDescription className="text-gray-400">
            Configure your chat preferences with {peerName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeOuterTab} onValueChange={setActiveOuterTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 bg-[#262C4A] h-12 flex-shrink-0" data-testid="outer-tabs">
            <TabsTrigger
              value="general"
              data-testid="tab-general"
              className="data-[state=active]:bg-[#6E59A5] data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger
              value="file"
              data-testid="tab-file"
              className="data-[state=active]:bg-[#6E59A5] data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">File</span>
            </TabsTrigger>
            <TabsTrigger
              value="advanced"
              data-testid="tab-advanced"
              className="data-[state=active]:bg-[#6E59A5] data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <Sliders className="h-4 w-4" />
              <span className="hidden sm:inline">Advanced</span>
            </TabsTrigger>
            <TabsTrigger
              value="stats"
              data-testid="tab-stats"
              className="data-[state=active]:bg-[#6E59A5] data-[state=active]:text-white text-gray-400 gap-1.5"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Stats</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-6 m-0" data-testid="content-general">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A]/50">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-purple-400" />
                    <div>
                      <Label className="text-sm font-medium">Notifications</Label>
                      <p className="text-xs text-gray-400">Receive alerts for new messages</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A]/50">
                  <div className="flex items-center gap-3">
                    <Eye className="h-5 w-5 text-blue-400" />
                    <div>
                      <Label className="text-sm font-medium">Read Receipts</Label>
                      <p className="text-xs text-gray-400">Show when you've read messages</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A]/50">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-green-400" />
                    <div>
                      <Label className="text-sm font-medium">Typing Indicators</Label>
                      <p className="text-xs text-gray-400">Show when you're typing</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </TabsContent>

            {/* File Tab with Inner Tabs */}
            <TabsContent value="file" className="m-0" data-testid="content-file">
              <ChatSettingsFileTab
                peerName={peerName}
                activeFileTab={activeFileTab}
                setActiveFileTab={setActiveFileTab}
                settings={settings}
                maxFileSizeMb={maxFileSizeMb}
                revfsQuotaMb={revfsQuotaMb}
                defaultMaxMb={defaultMaxMb}
                formatBytes={formatBytes}
                onAutoAcceptChange={handleAutoAcceptChange}
                onMaxFileSizeChange={handleMaxFileSizeChange}
                onTransferModeChange={handleTransferModeChange}
                onAllowRevfsChange={handleAllowRevfsChange}
                onRevfsQuotaChange={handleRevfsQuotaChange}
              />
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-4 m-0" data-testid="content-advanced">
              <div className="p-6 rounded-lg bg-[#262C4A]/30 text-center">
                <Sliders className="h-10 w-10 text-gray-500 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-300 mb-1">Advanced Settings</h3>
                <p className="text-xs text-gray-500">
                  Encryption preferences, connection settings, and protocol options coming soon.
                </p>
              </div>
            </TabsContent>

            {/* Stats Tab */}
            <TabsContent value="stats" className="space-y-4 m-0" data-testid="content-stats">
              <div className="p-6 rounded-lg bg-[#262C4A]/30 text-center">
                <BarChart3 className="h-10 w-10 text-gray-500 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-300 mb-1">Chat Statistics</h3>
                <p className="text-xs text-gray-500">
                  Message counts, file transfer history, and usage analytics coming soon.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
