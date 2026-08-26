import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/components/shared/confirm-dialog';
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
import { p2pMessengerManager } from '@/lib/p2p';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import { useToast } from '@/hooks/use-toast';
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
  const confirm = useConfirm();
  const {
    stats,
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
  const { toast } = useToast();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-background border-surface text-foreground sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/20">
              <Settings className="h-5 w-5 text-primary-accent" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              Chat Settings
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground">
            Configure your chat preferences with {peerName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeOuterTab} onValueChange={setActiveOuterTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 bg-surface h-12 flex-shrink-0" data-testid="outer-tabs">
            <TabsTrigger
              value="general"
              data-testid="tab-general"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger
              value="file"
              data-testid="tab-file"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">File</span>
            </TabsTrigger>
            <TabsTrigger
              value="advanced"
              data-testid="tab-advanced"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5"
            >
              <Sliders className="h-4 w-4" />
              <span className="hidden sm:inline">Advanced</span>
            </TabsTrigger>
            <TabsTrigger
              value="stats"
              data-testid="tab-stats"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Stats</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-6 m-0" data-testid="content-general">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-primary-accent" />
                    <div>
                      <Label className="text-sm font-medium">Notifications</Label>
                      <p className="text-xs text-muted-foreground">Receive alerts for new messages</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
                  <div className="flex items-center gap-3">
                    <Eye className="h-5 w-5 text-primary-accent" />
                    <div>
                      <Label className="text-sm font-medium">Read Receipts</Label>
                      <p className="text-xs text-muted-foreground">Show when you've read messages</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-success" />
                    <div>
                      <Label className="text-sm font-medium">Typing Indicators</Label>
                      <p className="text-xs text-muted-foreground">Show when you're typing</p>
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
                <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
                  <div className="flex items-center gap-3">
                    <Sliders className="h-5 w-5 text-warning" />
                    <div>
                      <Label className="text-sm font-medium">Encryption Level</Label>
                      <p className="text-xs text-muted-foreground">Security level for this conversation</p>
                    </div>
                  </div>
                  <select
                    className="bg-surface border border-surface rounded px-2 py-1 text-sm text-foreground/80"
                    defaultValue="standard"
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                    <option value="maximum">Maximum</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5 text-primary-accent" />
                    <div>
                      <Label className="text-sm font-medium">Connection Priority</Label>
                      <p className="text-xs text-muted-foreground">Prefer direct P2P or server relay</p>
                    </div>
                  </div>
                  <select
                    className="bg-surface border border-surface rounded px-2 py-1 text-sm text-foreground/80"
                    defaultValue="p2p"
                  >
                    <option value="p2p">P2P First</option>
                    <option value="server">Server First</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>

                <div className="p-4 rounded-lg bg-surface/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-success" />
                      <div>
                        <Label className="text-sm font-medium">Message Retention</Label>
                        <p className="text-xs text-muted-foreground">Days to keep message history locally</p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">90 days</span>
                  </div>
                  <input
                    type="range"
                    min={7}
                    max={365}
                    defaultValue={90}
                    className="w-full accent-primary-accent"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>7 days</span>
                    <span>1 year</span>
                  </div>
                </div>

                <button
                  className="w-full p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive-emphasis text-sm hover:bg-destructive/20 transition-colors"
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: `Clear all chat history with ${peerName}?`,
                        description: 'Messages stored on this device are removed. This cannot be undone.',
                        confirmLabel: 'Clear history',
                      });
                      if (!ok) return;
                      // Was `localStorage.removeItem('chat-history:' + peerCid)`
                      // — a key nothing in this app has ever written, so the
                      // button removed nothing while the dialog promised the
                      // messages were gone. History lives behind
                      // messagePaginationStore; this clears the stored pages AND
                      // the in-memory copy the open chat is rendering.
                      try {
                        await p2pMessengerManager.clearConversationHistory(BigInt(peerCid));
                        toastSuccess(toast, 'Chat history cleared', `Messages with ${peerName} were removed from this device.`);
                      } catch (error) {
                        toastError(
                          toast,
                          'Could not clear chat history',
                          error instanceof Error ? error.message : 'Unknown error',
                        );
                      }
                    })();
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
                  <div className="p-4 rounded-lg bg-surface/50 text-center">
                    <BarChart3 className="h-5 w-5 text-primary-accent mx-auto mb-2" />
                    <p className="text-2xl font-bold text-foreground">
                      {stats.messages}
                    </p>
                    <p className="text-xs text-muted-foreground">Messages</p>
                  </div>
                  <div className="p-4 rounded-lg bg-surface/50 text-center">
                    <FileText className="h-5 w-5 text-primary-accent mx-auto mb-2" />
                    <p className="text-2xl font-bold text-foreground">
                      {stats.files}
                    </p>
                    <p className="text-xs text-muted-foreground">Files Transferred</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <span className="text-sm text-muted-foreground">Peer CID</span>
                    <span className="text-sm text-foreground/80 font-mono">{peerCid.slice(0, 16)}...</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <span className="text-sm text-muted-foreground">Connection Type</span>
                    <span className="text-sm text-foreground/80">P2P Encrypted</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <span className="text-sm text-muted-foreground">First Connected</span>
                    <span className="text-sm text-foreground/80">
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
                  <div className="flex items-center justify-between p-3 rounded-lg bg-surface/50">
                    <span className="text-sm text-muted-foreground">Storage Used</span>
                    <span className="text-sm text-foreground/80">
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
