import { useState, useEffect } from 'react';
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

  return {
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
  };
}
