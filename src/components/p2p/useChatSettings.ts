import { useState, useEffect } from 'react';
import { p2pMessengerManager } from '@/lib/p2p';
import { fileTransferService, type FileTransferSettings, type TransferModePreference } from '@/lib/file-transfer';
import {
  FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
  REVFS_DEFAULT_QUOTA_BYTES
} from '@/types/messaging-layer';

export function useChatSettings(isOpen: boolean, peerCid: string) {
  const [activeOuterTab, setActiveOuterTab] = useState('general');
  const [activeFileTab, setActiveFileTab] = useState('standard');
  const [settings, setSettings] = useState<FileTransferSettings>({
    autoAccept: false,
    maxFileSize: FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES,
    transferMode: 'browser',
    allowRevfsStorage: false,
    revfsQuota: REVFS_DEFAULT_QUOTA_BYTES,
  });

  /**
   * Real conversation statistics.
   *
   * The Stats tab used to read `p2p-messages:{cid}` and `file-transfers:{cid}`
   * straight out of localStorage. Neither key is written ANYWHERE in this app —
   * each appeared exactly once, in the read itself — so both panels reported 0
   * for every conversation, however long. A confidently-rendered "0 Messages"
   * over a thread full of them is worse than showing nothing.
   *
   * totalMessageCount is the count the pagination store maintains (incremented
   * per stored message); deleting a conversation removes its metadata, so a
   * cleared thread correctly reads back as 0 again.
   */
  const [stats, setStats] = useState<{ messages: number; files: number }>({ messages: 0, files: 0 });

  useEffect(() => {
    if (!isOpen || !peerCid) return;
    let cancelled: boolean = false;
    void (async (): Promise<void> => {
      try {
        const metadata = await p2pMessengerManager.getConversationMetadata(BigInt(peerCid));
        const transfers = fileTransferService.getTransfersForPeer(peerCid);
        if (!cancelled) {
          setStats({ messages: metadata?.totalMessageCount ?? 0, files: transfers.length });
        }
      } catch {
        // A conversation with no stored history has no metadata; 0 is correct.
        if (!cancelled) setStats({ messages: 0, files: 0 });
      }
    })();
    return (): void => { cancelled = true; };
  }, [isOpen, peerCid]);

  useEffect(() => {
    if (isOpen && peerCid) {
      const currentSettings: FileTransferSettings = fileTransferService.getSettings(peerCid);
      setSettings(currentSettings);
    }
  }, [isOpen, peerCid]);

  // Deliberately always megabytes, because it labels a size LIMIT the user set
  // in megabytes -- rendering "1 GB" beside a slider marked in MB reads as a
  // different setting. Renamed off formatBytes so it stops looking like the
  // general formatter it is not.
  const formatSizeLimit = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    const mb: number = bytes / (1024 * 1024);
    return `${Math.round(mb)} MB`;
  };

  const handleAutoAcceptChange = async (enabled: boolean): Promise<void> => {
    setSettings(prev => ({ ...prev, autoAccept: enabled }));
    await fileTransferService.setAutoAccept(peerCid, enabled);
  };

  const handleMaxFileSizeChange = async (values: number[]): Promise<void> => {
    const bytes: number = values[0] * 1024 * 1024;
    setSettings(prev => ({ ...prev, maxFileSize: bytes }));
    await fileTransferService.setMaxFileSize(peerCid, bytes);
  };

  const handleTransferModeChange = async (mode: TransferModePreference): Promise<void> => {
    setSettings(prev => ({ ...prev, transferMode: mode }));
    await fileTransferService.setTransferMode(peerCid, mode);
  };

  const handleAllowRevfsChange = async (allowed: boolean): Promise<void> => {
    setSettings(prev => ({ ...prev, allowRevfsStorage: allowed }));
    await fileTransferService.setAllowRevfsStorage(peerCid, allowed);
  };

  const handleRevfsQuotaChange = async (values: number[]): Promise<void> => {
    const bytes: number = values[0] * 1024 * 1024;
    setSettings(prev => ({ ...prev, revfsQuota: bytes }));
    await fileTransferService.setRevfsQuota(peerCid, bytes);
  };

  const maxFileSizeMb: number = Math.round(settings.maxFileSize / (1024 * 1024));
  const revfsQuotaMb: number = Math.round(settings.revfsQuota / (1024 * 1024));
  const defaultMaxMb: number = Math.round(FILE_TRANSFER_DEFAULT_MAX_SIZE_BYTES / (1024 * 1024));

  return {
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
  };
}
