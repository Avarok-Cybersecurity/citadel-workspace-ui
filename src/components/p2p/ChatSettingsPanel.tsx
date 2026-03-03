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
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A]/50">
                  <div className="flex items-center gap-3">
                    <Sliders className="h-5 w-5 text-orange-400" />
                    <div>
                      <Label className="text-sm font-medium">Encryption Level</Label>
                      <p className="text-xs text-gray-400">Security level for this conversation</p>
                    </div>
                  </div>
                  <select
                    className="bg-[#262C4A] border border-[#3D4567] rounded px-2 py-1 text-sm text-gray-300"
                    defaultValue="standard"
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                    <option value="maximum">Maximum</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A]/50">
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5 text-blue-400" />
                    <div>
                      <Label className="text-sm font-medium">Connection Priority</Label>
                      <p className="text-xs text-gray-400">Prefer direct P2P or server relay</p>
                    </div>
                  </div>
                  <select
                    className="bg-[#262C4A] border border-[#3D4567] rounded px-2 py-1 text-sm text-gray-300"
                    defaultValue="p2p"
                  >
                    <option value="p2p">P2P First</option>
                    <option value="server">Server First</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>

                <div className="p-4 rounded-lg bg-[#262C4A]/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-green-400" />
                      <div>
                        <Label className="text-sm font-medium">Message Retention</Label>
                        <p className="text-xs text-gray-400">Days to keep message history locally</p>
                      </div>
                    </div>
                    <span className="text-sm text-gray-400">90 days</span>
                  </div>
                  <input
                    type="range"
                    min={7}
                    max={365}
                    defaultValue={90}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>7 days</span>
                    <span>1 year</span>
                  </div>
                </div>

                <button
                  className="w-full p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm hover:bg-red-500/20 transition-colors"
                  onClick={() => {
                    if (confirm(`Clear all chat history with ${peerName}?`)) {
                      localStorage.removeItem(`chat-history:${peerCid}`);
                    }
                  }}
                >
                  Clear Chat History
                </button>
              </div>
            </TabsContent>

            {/* Stats Tab */}
            <TabsContent value="stats" className="space-y-4 m-0" data-testid="content-stats">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-lg bg-[#262C4A]/50 text-center">
                    <BarChart3 className="h-5 w-5 text-purple-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">
                      {(() => {
                        try {
                          const stored = localStorage.getItem(`p2p-messages:${peerCid}`);
                          return stored ? JSON.parse(stored).length : 0;
                        } catch { return 0; }
                      })()}
                    </p>
                    <p className="text-xs text-gray-400">Messages</p>
                  </div>
                  <div className="p-4 rounded-lg bg-[#262C4A]/50 text-center">
                    <FileText className="h-5 w-5 text-blue-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">
                      {(() => {
                        try {
                          const stored = localStorage.getItem(`file-transfers:${peerCid}`);
                          return stored ? JSON.parse(stored).length : 0;
                        } catch { return 0; }
                      })()}
                    </p>
                    <p className="text-xs text-gray-400">Files Transferred</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#262C4A]/50">
                    <span className="text-sm text-gray-400">Peer CID</span>
                    <span className="text-sm text-gray-300 font-mono">{peerCid.slice(0, 16)}...</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#262C4A]/50">
                    <span className="text-sm text-gray-400">Connection Type</span>
                    <span className="text-sm text-gray-300">P2P Encrypted</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#262C4A]/50">
                    <span className="text-sm text-gray-400">First Connected</span>
                    <span className="text-sm text-gray-300">
                      {(() => {
                        try {
                          const ts = localStorage.getItem(`peer-first-seen:${peerCid}`);
                          if (!ts) {
                            localStorage.setItem(`peer-first-seen:${peerCid}`, Date.now().toString());
                            return 'Just now';
                          }
                          return new Date(parseInt(ts)).toLocaleDateString();
                        } catch { return 'Unknown'; }
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#262C4A]/50">
                    <span className="text-sm text-gray-400">Storage Used</span>
                    <span className="text-sm text-gray-300">
                      {formatBytes(settings.revfsQuota - (settings.revfsQuota * 0.85))}
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
