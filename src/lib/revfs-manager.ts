/**
 * REVFSManager - Remote Encrypted Virtual File System Manager
 *
 * Manages decentralized file storage across the server and peer devices.
 * Files stored via RE-VFS are encrypted with post-quantum cryptography,
 * meaning storage hosts cannot view or decrypt the contents.
 *
 * Storage Locations:
 * - Server: Files stored on the workspace server
 * - Peers: Files stored on connected peer devices
 */

import { eventEmitter } from './event-emitter';
import { getSelectedUser } from './tab-context';

// ============================================================================
// Types
// ============================================================================

export interface VirtualFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: number;
  modifiedAt: number;
  virtualPath: string;
  storageCid: string; // CID of the storage host (server or peer)
  isOwned: boolean;   // true if we uploaded this file
}

export interface StorageLocation {
  cid: string;
  name: string;
  type: 'server' | 'peer';
  totalFiles: number;
  usedBytes: number;
  quotaBytes: number;
  isConnected: boolean;
}

export interface StorageStats {
  totalFiles: number;
  usedBytes: number;
  quotaBytes: number;
}

// ============================================================================
// Events
// ============================================================================

export const REVFS_EVENTS = {
  FILES_UPDATED: 'revfs:files-updated',
  STORAGE_UPDATED: 'revfs:storage-updated',
  UPLOAD_PROGRESS: 'revfs:upload-progress',
  DOWNLOAD_PROGRESS: 'revfs:download-progress',
  ERROR: 'revfs:error',
} as const;

// ============================================================================
// REVFSManager
// ============================================================================

export class REVFSManager {
  private static instance: REVFSManager;

  // Files indexed by storage CID
  private filesByStorage: Map<string, VirtualFile[]> = new Map();

  // Storage locations
  private storageLocations: Map<string, StorageLocation> = new Map();

  // Current user's CID
  private currentCid: string | null = null;

  private initialized = false;

  private constructor() {}

  static getInstance(): REVFSManager {
    if (!REVFSManager.instance) {
      REVFSManager.instance = new REVFSManager();
    }
    return REVFSManager.instance;
  }

  /**
   * Initialize the RE-VFS manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.currentCid = await this.getCurrentCid();

    // Initialize with server storage location
    if (this.currentCid) {
      this.storageLocations.set('server', {
        cid: 'server',
        name: 'Server Storage',
        type: 'server',
        totalFiles: 0,
        usedBytes: 0,
        quotaBytes: 100 * 1024 * 1024, // 100MB default
        isConnected: true,
      });
    }

    this.initialized = true;
    console.log('REVFSManager: Initialized');
  }

  // ============================================================================
  // Storage Location Management
  // ============================================================================

  /**
   * Get all storage locations
   */
  getStorageLocations(): StorageLocation[] {
    return Array.from(this.storageLocations.values());
  }

  /**
   * Get a specific storage location
   */
  getStorageLocation(cid: string): StorageLocation | undefined {
    return this.storageLocations.get(cid);
  }

  /**
   * Add a peer storage location
   */
  addPeerStorage(peerCid: string, peerName: string, quotaBytes: number): void {
    if (!this.storageLocations.has(peerCid)) {
      this.storageLocations.set(peerCid, {
        cid: peerCid,
        name: peerName,
        type: 'peer',
        totalFiles: 0,
        usedBytes: 0,
        quotaBytes,
        isConnected: true,
      });
      eventEmitter.emit(REVFS_EVENTS.STORAGE_UPDATED, this.getStorageLocations());
    }
  }

  /**
   * Update peer connection status
   */
  updatePeerConnectionStatus(peerCid: string, isConnected: boolean): void {
    const location = this.storageLocations.get(peerCid);
    if (location) {
      location.isConnected = isConnected;
      eventEmitter.emit(REVFS_EVENTS.STORAGE_UPDATED, this.getStorageLocations());
    }
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * List files in a storage location
   */
  async listFiles(storageCid: string, virtualDirectory?: string): Promise<VirtualFile[]> {
    // TODO: Implement actual file listing via DownloadFile request
    // For now, return cached files
    const files = this.filesByStorage.get(storageCid) || [];

    if (virtualDirectory) {
      return files.filter(f => f.virtualPath.startsWith(virtualDirectory));
    }

    return files;
  }

  /**
   * Upload a file to a storage location
   */
  async uploadFile(
    storageCid: string,
    file: File,
    virtualDirectory: string = '/'
  ): Promise<VirtualFile> {
    const currentCid = await this.getCurrentCid();
    if (!currentCid) {
      throw new Error('Not connected');
    }

    // TODO: Implement actual file upload via SendFile request
    // For now, create a mock file record

    const virtualPath = `${virtualDirectory}${file.name}`.replace(/\/+/g, '/');

    const virtualFile: VirtualFile = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mimeType: file.type,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      virtualPath,
      storageCid,
      isOwned: true,
    };

    // Add to cache
    const files = this.filesByStorage.get(storageCid) || [];
    files.push(virtualFile);
    this.filesByStorage.set(storageCid, files);

    // Update storage stats
    const location = this.storageLocations.get(storageCid);
    if (location) {
      location.totalFiles++;
      location.usedBytes += file.size;
    }

    eventEmitter.emit(REVFS_EVENTS.FILES_UPDATED, { storageCid, files });
    eventEmitter.emit(REVFS_EVENTS.STORAGE_UPDATED, this.getStorageLocations());

    console.log('REVFSManager: File uploaded', { virtualFile, storageCid });
    return virtualFile;
  }

  /**
   * Download a file from a storage location
   */
  async downloadFile(
    storageCid: string,
    virtualPath: string,
    deleteOnPull: boolean = false
  ): Promise<Blob> {
    // TODO: Implement actual file download via DownloadFile request
    console.log('REVFSManager: Downloading file', { storageCid, virtualPath, deleteOnPull });

    // For now, throw an error indicating it's not implemented
    throw new Error('File download not yet implemented');
  }

  /**
   * Delete a file from a storage location
   */
  async deleteFile(storageCid: string, virtualPath: string): Promise<void> {
    // TODO: Implement actual file deletion via DeleteVirtualFile request

    // Remove from cache
    const files = this.filesByStorage.get(storageCid) || [];
    const fileIndex = files.findIndex(f => f.virtualPath === virtualPath);

    if (fileIndex !== -1) {
      const deletedFile = files[fileIndex];
      files.splice(fileIndex, 1);
      this.filesByStorage.set(storageCid, files);

      // Update storage stats
      const location = this.storageLocations.get(storageCid);
      if (location) {
        location.totalFiles--;
        location.usedBytes -= deletedFile.size;
      }

      eventEmitter.emit(REVFS_EVENTS.FILES_UPDATED, { storageCid, files });
      eventEmitter.emit(REVFS_EVENTS.STORAGE_UPDATED, this.getStorageLocations());

      console.log('REVFSManager: File deleted', { storageCid, virtualPath });
    }
  }

  /**
   * Get file info
   */
  getFileInfo(storageCid: string, virtualPath: string): VirtualFile | undefined {
    const files = this.filesByStorage.get(storageCid) || [];
    return files.find(f => f.virtualPath === virtualPath);
  }

  // ============================================================================
  // Storage Stats
  // ============================================================================

  /**
   * Get storage stats for a location
   */
  getStorageStats(storageCid: string): StorageStats {
    const location = this.storageLocations.get(storageCid);
    if (!location) {
      return { totalFiles: 0, usedBytes: 0, quotaBytes: 0 };
    }

    return {
      totalFiles: location.totalFiles,
      usedBytes: location.usedBytes,
      quotaBytes: location.quotaBytes,
    };
  }

  /**
   * Get total storage stats across all locations
   */
  getTotalStorageStats(): StorageStats {
    let totalFiles = 0;
    let usedBytes = 0;
    let quotaBytes = 0;

    for (const location of this.storageLocations.values()) {
      totalFiles += location.totalFiles;
      usedBytes += location.usedBytes;
      quotaBytes += location.quotaBytes;
    }

    return { totalFiles, usedBytes, quotaBytes };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async getCurrentCid(): Promise<string | null> {
    const tabSelection = await getSelectedUser();
    return tabSelection?.selectedCid?.toString() || null;
  }

  /**
   * Format bytes to human-readable string
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const revfsManager = REVFSManager.getInstance();
