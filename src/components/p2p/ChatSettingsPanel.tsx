import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Settings,
  FileText,
  Sliders,
  BarChart3,
  Upload,
  HardDrive,
  Info,
  Shield,
  Zap,
  Bell,
  Eye,
  MessageSquare
} from 'lucide-react';
import { fileTransferService, type FileTransferSettings, type TransferModePreference } from '@/lib/file-transfer';
import {
  FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
  REVFS_DEFAULT_QUOTA_BYTES
} from '@/types/messaging-layer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
  const [activeOuterTab, setActiveOuterTab] = useState('general');
  const [activeFileTab, setActiveFileTab] = useState('standard');
  const [settings, setSettings] = useState<FileTransferSettings>({
    autoAccept: false,
    maxFileSize: FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
    transferMode: 'browser',
    allowRevfsStorage: false,
    revfsQuota: REVFS_DEFAULT_QUOTA_BYTES,
  });

  // Load settings on open
  useEffect(() => {
    if (isOpen && peerCid) {
      const currentSettings = fileTransferService.getSettings(peerCid);
      setSettings(currentSettings);
    }
  }, [isOpen, peerCid]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${Math.round(mb)} MB`;
  };

  // Handler functions
  const handleAutoAcceptChange = async (enabled: boolean) => {
    setSettings(prev => ({ ...prev, autoAccept: enabled }));
    await fileTransferService.setAutoAccept(peerCid, enabled);
  };

  const handleMaxFileSizeChange = async (values: number[]) => {
    const bytes = values[0] * 1024 * 1024;
    setSettings(prev => ({ ...prev, maxFileSize: bytes }));
    await fileTransferService.setMaxFileSize(peerCid, bytes);
  };

  const handleTransferModeChange = async (mode: TransferModePreference) => {
    setSettings(prev => ({ ...prev, transferMode: mode }));
    await fileTransferService.setTransferMode(peerCid, mode);
  };

  const handleAllowRevfsChange = async (allowed: boolean) => {
    setSettings(prev => ({ ...prev, allowRevfsStorage: allowed }));
    await fileTransferService.setAllowRevfsStorage(peerCid, allowed);
  };

  const handleRevfsQuotaChange = async (values: number[]) => {
    const bytes = values[0] * 1024 * 1024;
    setSettings(prev => ({ ...prev, revfsQuota: bytes }));
    await fileTransferService.setRevfsQuota(peerCid, bytes);
  };

  const maxFileSizeMb = Math.round(settings.maxFileSize / (1024 * 1024));
  const revfsQuotaMb = Math.round(settings.revfsQuota / (1024 * 1024));
  const defaultMaxMb = Math.round(FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES / (1024 * 1024));

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

        {/* Outer Tabs */}
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

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto mt-4">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-6 m-0" data-testid="content-general">
              <div className="space-y-4">
                {/* Notifications */}
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

                {/* Read Receipts */}
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

                {/* Typing Indicators */}
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
              <Tabs value={activeFileTab} onValueChange={setActiveFileTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-[#1a1b26] h-10 mb-4" data-testid="inner-file-tabs">
                  <TabsTrigger
                    value="standard"
                    data-testid="tab-file-standard"
                    className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-300 text-gray-400 gap-1.5 text-sm"
                  >
                    <Upload className="h-4 w-4" />
                    Standard
                  </TabsTrigger>
                  <TabsTrigger
                    value="remote-storage"
                    data-testid="tab-file-remote"
                    className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-300 text-gray-400 gap-1.5 text-sm"
                  >
                    <HardDrive className="h-4 w-4" />
                    Remote Storage
                  </TabsTrigger>
                </TabsList>

                {/* Standard File Transfer Settings */}
                <TabsContent value="standard" className="space-y-5 m-0" data-testid="content-file-standard">
                  {/* Transfer Mode Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">Transfer Method</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-gray-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-[#1C1D28] border-[#262C4A] text-white">
                            <p className="text-sm">
                              <strong>Browser:</strong> Simple in-browser file chunking. Good for small files.<br/>
                              <strong>Citadel Protocol:</strong> Advanced post-quantum encrypted transfer. Required for RE-VFS.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    <RadioGroup
                      value={settings.transferMode}
                      onValueChange={(v) => handleTransferModeChange(v as TransferModePreference)}
                      className="space-y-2"
                      data-testid="transfer-mode-radio"
                    >
                      <div className="flex items-center space-x-3 p-3 rounded-lg bg-[#262C4A]/50 hover:bg-[#262C4A] transition-colors cursor-pointer">
                        <RadioGroupItem value="browser" id="browser" className="border-purple-400 text-purple-400" />
                        <Label htmlFor="browser" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Browser Transfer</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Default</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">Simple and reliable for most files</p>
                        </Label>
                      </div>

                      <div className="flex items-center space-x-3 p-3 rounded-lg bg-[#262C4A]/50 hover:bg-[#262C4A] transition-colors cursor-pointer">
                        <RadioGroupItem value="protocol" id="protocol" className="border-purple-400 text-purple-400" />
                        <Label htmlFor="protocol" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Citadel Protocol</span>
                            <Zap className="h-3.5 w-3.5 text-yellow-400" />
                            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Experimental</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">Post-quantum encryption, required for RE-VFS</p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Auto-accept toggle */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A]/50">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-accept" className="text-sm font-medium">
                        Auto-accept files from {peerName}
                      </Label>
                      <p className="text-xs text-gray-400">
                        Automatically download files without confirmation
                      </p>
                    </div>
                    <Switch
                      id="auto-accept"
                      checked={settings.autoAccept}
                      onCheckedChange={handleAutoAcceptChange}
                      data-testid="auto-accept-switch"
                    />
                  </div>

                  {/* Max file size slider */}
                  <div className="space-y-3 p-4 rounded-lg bg-[#262C4A]/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Max file size to accept</Label>
                      <span className="text-sm text-purple-400 font-medium" data-testid="max-file-size-value">{maxFileSizeMb} MB</span>
                    </div>
                    <Slider
                      value={[maxFileSizeMb]}
                      onValueChange={handleMaxFileSizeChange}
                      max={defaultMaxMb}
                      min={1}
                      step={1}
                      className="w-full"
                      data-testid="max-file-size-slider"
                    />
                    <p className="text-xs text-gray-500">
                      Server default: {formatBytes(FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES)}
                    </p>
                  </div>

                  {/* Info note */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-300">
                      Downloaded files are auto-deleted from the server after download.
                    </p>
                  </div>
                </TabsContent>

                {/* Remote Storage (RE-VFS) Settings */}
                <TabsContent value="remote-storage" className="space-y-5 m-0" data-testid="content-file-remote">
                  {/* Allow storage toggle with security info */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A]/50">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="allow-revfs" className="text-sm font-medium">
                          Allow {peerName} to store files on your device
                        </Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Shield className="h-4 w-4 text-green-400 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs bg-[#1C1D28] border-[#262C4A] text-white">
                              <p className="text-sm">
                                <strong>Post-Quantum Secure:</strong> When you allow storage, you become a
                                blind host. Files are encrypted with post-quantum algorithms — you cannot
                                view or decrypt their contents. Only the file owner has the keys.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="text-xs text-gray-400">
                        Provide encrypted storage space for this peer
                      </p>
                    </div>
                    <Switch
                      id="allow-revfs"
                      checked={settings.allowRevfsStorage}
                      onCheckedChange={handleAllowRevfsChange}
                      data-testid="allow-revfs-switch"
                    />
                  </div>

                  {/* Storage quota slider */}
                  <div className={`space-y-3 p-4 rounded-lg bg-[#262C4A]/50 ${!settings.allowRevfsStorage ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Storage quota for {peerName}</Label>
                      <span className="text-sm text-purple-400 font-medium" data-testid="revfs-quota-value">{revfsQuotaMb} MB</span>
                    </div>
                    <Slider
                      value={[revfsQuotaMb]}
                      onValueChange={handleRevfsQuotaChange}
                      max={defaultMaxMb}
                      min={1}
                      step={1}
                      className="w-full"
                      disabled={!settings.allowRevfsStorage}
                      data-testid="revfs-quota-slider"
                    />
                    <p className="text-xs text-gray-500">
                      Server default: {formatBytes(REVFS_DEFAULT_QUOTA_BYTES)}
                    </p>
                  </div>

                  {/* Security info box */}
                  <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-medium text-green-400 mb-1">
                          Zero-Knowledge Storage
                        </h4>
                        <p className="text-xs text-gray-300">
                          RE-VFS uses post-quantum cryptography to ensure complete privacy.
                          As a storage host, you provide blind storage — you cannot view, read,
                          or decrypt the stored files. Only the file owner holds the decryption keys.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* RE-VFS note */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-300">
                      Files persist until manually deleted via File Manager
                      (Right-click → Delete).
                    </p>
                  </div>

                  {/* Warning about Citadel Protocol requirement */}
                  {settings.allowRevfsStorage && settings.transferMode !== 'protocol' && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <Zap className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-yellow-200">
                        <strong>Note:</strong> RE-VFS requires the Citadel Protocol transfer method.
                        Switch to Citadel Protocol in the Standard tab to enable full RE-VFS functionality.
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
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
