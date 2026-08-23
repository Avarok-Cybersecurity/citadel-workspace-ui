import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Info, Shield, Zap } from 'lucide-react';
import { REVFS_DEFAULT_QUOTA_BYTES } from '@/types/messaging-layer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { FileTransferSettings } from '@/lib/file-transfer';

interface ChatSettingsRemoteTabProps {
  peerName: string;
  settings: FileTransferSettings;
  revfsQuotaMb: number;
  defaultMaxMb: number;
  formatBytes: (bytes: number) => string;
  onAllowRevfsChange: (allowed: boolean) => Promise<void>;
  onRevfsQuotaChange: (values: number[]) => Promise<void>;
}

export function ChatSettingsRemoteTab({
  peerName, settings, revfsQuotaMb, defaultMaxMb, formatBytes,
  onAllowRevfsChange, onRevfsQuotaChange,
}: ChatSettingsRemoteTabProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="allow-revfs" className="text-sm font-medium">
              Allow {peerName} to store files on your device
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Shield className="h-4 w-4 text-green-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs bg-background border-surface text-foreground">
                <p className="text-sm">
                  <strong>Post-Quantum Secure:</strong> When you allow storage, you become a
                  blind host. Files are encrypted with post-quantum algorithms — you cannot
                  view or decrypt their contents. Only the file owner has the keys.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">Provide encrypted storage space for this peer</p>
        </div>
        <Switch
          id="allow-revfs"
          checked={settings.allowRevfsStorage}
          onCheckedChange={onAllowRevfsChange}
          data-testid="allow-revfs-switch"
        />
      </div>

      <div className={`space-y-3 p-4 rounded-lg bg-surface/50 ${!settings.allowRevfsStorage ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Storage quota for {peerName}</Label>
          <span className="text-sm text-purple-400 font-medium" data-testid="revfs-quota-value">{revfsQuotaMb} MB</span>
        </div>
        <Slider
          value={[revfsQuotaMb]} onValueChange={onRevfsQuotaChange}
          max={defaultMaxMb} min={1} step={1} className="w-full"
          disabled={!settings.allowRevfsStorage} data-testid="revfs-quota-slider"
        />
        <p className="text-xs text-muted-foreground">Server default: {formatBytes(REVFS_DEFAULT_QUOTA_BYTES)}</p>
      </div>

      <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-green-400 mb-1">Zero-Knowledge Storage</h4>
            <p className="text-xs text-foreground/80">
              RE-VFS uses post-quantum cryptography to ensure complete privacy.
              As a storage host, you provide blind storage — you cannot view, read,
              or decrypt the stored files. Only the file owner holds the decryption keys.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-foreground/80">
          Files persist until manually deleted via File Manager (Right-click → Delete).
        </p>
      </div>

      {settings.allowRevfsStorage && settings.transferMode !== 'protocol' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <Zap className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-yellow-200">
            <strong>Note:</strong> RE-VFS requires the Citadel Protocol transfer method.
            Switch to Citadel Protocol in the Standard tab to enable full RE-VFS functionality.
          </p>
        </div>
      )}
    </div>
  );
}
