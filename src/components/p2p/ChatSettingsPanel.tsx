import { ConnectionFacts } from './ConnectionFacts';
import { useState } from 'react';
import {
  getPrivacySettings,
  savePrivacySettings,
  type PrivacySettings,
} from '@/lib/privacy-settings';
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

  // The workspace-wide privacy settings, so this panel's switches and the
  // Privacy settings tab cannot disagree about what is being broadcast.
  const [privacy, setPrivacy] = useState<PrivacySettings>(getPrivacySettings);
  const updatePrivacy = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]): void => {
    setPrivacy((prev) => {
      const next = { ...prev, [key]: value };
      savePrivacySettings(next);
      return next;
    });
  };
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
    formatSizeLimit,
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
             aria-label="General"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger
              value="file"
              data-testid="tab-file"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5"
             aria-label="File"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">File</span>
            </TabsTrigger>
            <TabsTrigger
              value="advanced"
              data-testid="tab-advanced"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5"
             aria-label="Advanced"
            >
              <Sliders className="h-4 w-4" />
              <span className="hidden sm:inline">Advanced</span>
            </TabsTrigger>
            <TabsTrigger
              value="stats"
              data-testid="tab-stats"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground gap-1.5"
             aria-label="Stats"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Stats</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-6 m-0" data-testid="content-general">
              <div className="space-y-4">
                {/* These are the workspace-wide privacy settings, not
                    per-conversation ones — they were uncontrolled `Switch
                    defaultChecked` here, with no handler and no store, so
                    turning read receipts or typing indicators OFF in this panel
                    changed nothing and both kept flowing. On a product whose
                    subject is privacy, a switch that lies about what you are
                    broadcasting is the worst kind to fake. Bound to the same
                    store the Privacy settings tab writes. */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
                  <div className="flex items-center gap-3">
                    <Eye className="h-5 w-5 text-primary-accent" />
                    <div>
                      <Label htmlFor="read-receipts" className="text-sm font-medium">Read Receipts</Label>
                      <p className="text-xs text-muted-foreground">Show when you've read messages</p>
                    </div>
                  </div>
                  <Switch
                    id="read-receipts"
                    checked={privacy.sendReadReceipts}
                    onCheckedChange={(v) => updatePrivacy('sendReadReceipts', v)}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-success-emphasis" />
                    <div>
                      <Label htmlFor="typing-indicators" className="text-sm font-medium">Typing Indicators</Label>
                      <p className="text-xs text-muted-foreground">Show when you're typing</p>
                    </div>
                  </div>
                  <Switch
                    id="typing-indicators"
                    checked={privacy.showTypingIndicators}
                    onCheckedChange={(v) => updatePrivacy('showTypingIndicators', v)}
                  />
                </div>

                <p className="text-xs text-muted-foreground px-1">
                  These apply to every conversation, and match what you set under
                  Settings → Privacy.
                </p>
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
                formatSizeLimit={formatSizeLimit}
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
                    <Sliders className="h-5 w-5 text-warning-emphasis" />
                    <div>
                      <Label htmlFor="encryption-level" className="text-sm font-medium">Encryption Level</Label>
                      <p className="text-xs text-muted-foreground">Security level for this conversation</p>
                    </div>
                  </div>
                  <select id="encryption-level"
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
                      <Label htmlFor="connection-priority" className="text-sm font-medium">Connection Priority</Label>
                      <p className="text-xs text-muted-foreground">Prefer direct P2P or server relay</p>
                    </div>
                  </div>
                  <select id="connection-priority"
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
                      <MessageSquare className="h-5 w-5 text-success-emphasis" />
                      <div>
                        <Label htmlFor="message-retention" className="text-sm font-medium">Message Retention</Label>
                        <p className="text-xs text-muted-foreground">Days to keep message history locally</p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">90 days</span>
                  </div>
                  <input id="message-retention"
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
                    void (async (): Promise<void> => {
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
                  <ConnectionFacts peerCid={peerCid} revfsQuota={settings.revfsQuota} />
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
