import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Upload, HardDrive, Info, Zap } from 'lucide-react';
import { FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES } from '@/types/messaging-layer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { FileTransferSettings, TransferModePreference } from '@/lib/file-transfer';
import { ChatSettingsRemoteTab } from './ChatSettingsRemoteTab';

interface ChatSettingsFileTabProps {
  peerName: string;
  activeFileTab: string;
  setActiveFileTab: (tab: string) => void;
  settings: FileTransferSettings;
  maxFileSizeMb: number;
  revfsQuotaMb: number;
  defaultMaxMb: number;
  formatBytes: (bytes: number) => string;
  onAutoAcceptChange: (enabled: boolean) => Promise<void>;
  onMaxFileSizeChange: (values: number[]) => Promise<void>;
  onTransferModeChange: (mode: TransferModePreference) => Promise<void>;
  onAllowRevfsChange: (allowed: boolean) => Promise<void>;
  onRevfsQuotaChange: (values: number[]) => Promise<void>;
}

export function ChatSettingsFileTab({
  peerName, activeFileTab, setActiveFileTab, settings,
  maxFileSizeMb, revfsQuotaMb, defaultMaxMb, formatBytes,
  onAutoAcceptChange, onMaxFileSizeChange, onTransferModeChange,
  onAllowRevfsChange, onRevfsQuotaChange,
}: ChatSettingsFileTabProps) {
  return (
    <Tabs value={activeFileTab} onValueChange={setActiveFileTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 bg-[#1a1b26] h-10 mb-4" data-testid="inner-file-tabs">
        <TabsTrigger value="standard" data-testid="tab-file-standard"
          className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-300 text-gray-400 gap-1.5 text-sm">
          <Upload className="h-4 w-4" /> Standard
        </TabsTrigger>
        <TabsTrigger value="remote-storage" data-testid="tab-file-remote"
          className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-300 text-gray-400 gap-1.5 text-sm">
          <HardDrive className="h-4 w-4" /> Remote Storage
        </TabsTrigger>
      </TabsList>

      <TabsContent value="standard" className="space-y-5 m-0" data-testid="content-file-standard">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Transfer Method</Label>
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
          </div>

          <RadioGroup value={settings.transferMode}
            onValueChange={(v) => onTransferModeChange(v as TransferModePreference)}
            className="space-y-2" data-testid="transfer-mode-radio">
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

        <div className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A]/50">
          <div className="space-y-0.5">
            <Label htmlFor="auto-accept" className="text-sm font-medium">
              Auto-accept files from {peerName}
            </Label>
            <p className="text-xs text-gray-400">Automatically download files without confirmation</p>
          </div>
          <Switch id="auto-accept" checked={settings.autoAccept}
            onCheckedChange={onAutoAcceptChange} data-testid="auto-accept-switch" />
        </div>

        <div className="space-y-3 p-4 rounded-lg bg-[#262C4A]/50">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Max file size to accept</Label>
            <span className="text-sm text-purple-400 font-medium" data-testid="max-file-size-value">{maxFileSizeMb} MB</span>
          </div>
          <Slider value={[maxFileSizeMb]} onValueChange={onMaxFileSizeChange}
            max={defaultMaxMb} min={1} step={1} className="w-full" data-testid="max-file-size-slider" />
          <p className="text-xs text-gray-500">
            Server default: {formatBytes(FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES)}
          </p>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-300">Downloaded files are auto-deleted from the server after download.</p>
        </div>
      </TabsContent>

      <TabsContent value="remote-storage" className="m-0" data-testid="content-file-remote">
        <ChatSettingsRemoteTab
          peerName={peerName} settings={settings}
          revfsQuotaMb={revfsQuotaMb} defaultMaxMb={defaultMaxMb}
          formatBytes={formatBytes} onAllowRevfsChange={onAllowRevfsChange}
          onRevfsQuotaChange={onRevfsQuotaChange}
        />
      </TabsContent>
    </Tabs>
  );
}
