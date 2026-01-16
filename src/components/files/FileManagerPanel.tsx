import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  HardDrive,
  Server,
  User,
  FolderOpen,
  File,
  FileImage,
  FileText,
  FileVideo,
  FileAudio,
  Upload,
  Download,
  Trash2,
  Info,
  ExternalLink,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';
import {
  revfsManager,
  type StorageLocation,
  type VirtualFile,
  REVFS_EVENTS,
} from '@/lib/revfs-manager';
import { eventEmitter } from '@/lib/event-emitter';

interface FileManagerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewMode = 'locations' | 'files';

export function FileManagerPanel({ isOpen, onClose }: FileManagerPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('locations');
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<StorageLocation | null>(null);
  const [files, setFiles] = useState<VirtualFile[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [isLoading, setIsLoading] = useState(false);

  // Load storage locations on mount
  useEffect(() => {
    if (isOpen) {
      void revfsManager.initialize();
      setStorageLocations(revfsManager.getStorageLocations());
    }
  }, [isOpen]);

  // Subscribe to updates
  useEffect(() => {
    const handleStorageUpdate = (locations: StorageLocation[]) => {
      setStorageLocations(locations);
    };

    const handleFilesUpdate = ({ storageCid, files: updatedFiles }: { storageCid: string; files: VirtualFile[] }) => {
      if (selectedLocation?.cid === storageCid) {
        setFiles(updatedFiles);
      }
    };

    eventEmitter.on(REVFS_EVENTS.STORAGE_UPDATED, handleStorageUpdate);
    eventEmitter.on(REVFS_EVENTS.FILES_UPDATED, handleFilesUpdate);

    return () => {
      eventEmitter.off(REVFS_EVENTS.STORAGE_UPDATED, handleStorageUpdate);
      eventEmitter.off(REVFS_EVENTS.FILES_UPDATED, handleFilesUpdate);
    };
  }, [selectedLocation]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <FileImage className="h-5 w-5 text-purple-400" />;
    if (mimeType.startsWith('video/')) return <FileVideo className="h-5 w-5 text-blue-400" />;
    if (mimeType.startsWith('audio/')) return <FileAudio className="h-5 w-5 text-green-400" />;
    if (mimeType.startsWith('text/') || mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-orange-400" />;
    return <File className="h-5 w-5 text-gray-400" />;
  };

  const handleBrowseLocation = async (location: StorageLocation) => {
    setSelectedLocation(location);
    setViewMode('files');
    setCurrentPath('/');
    setIsLoading(true);

    try {
      const locationFiles = await revfsManager.listFiles(location.cid);
      setFiles(locationFiles);
    } catch (error) {
      console.error('Failed to list files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setViewMode('locations');
    setSelectedLocation(null);
    setFiles([]);
    setCurrentPath('/');
  };

  const handleRefresh = async () => {
    if (!selectedLocation) return;
    setIsLoading(true);
    try {
      const locationFiles = await revfsManager.listFiles(selectedLocation.cid, currentPath);
      setFiles(locationFiles);
    } catch (error) {
      console.error('Failed to refresh files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenFile = async (file: VirtualFile) => {
    try {
      // Download and open
      const blob = await revfsManager.downloadFile(file.storageCid, file.virtualPath, false);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleOpenAndDelete = async (file: VirtualFile) => {
    try {
      // Download with delete_on_pull=true
      const blob = await revfsManager.downloadFile(file.storageCid, file.virtualPath, true);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleDeleteFile = async (file: VirtualFile) => {
    try {
      await revfsManager.deleteFile(file.storageCid, file.virtualPath);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const handleFileInfo = (file: VirtualFile) => {
    // Show file info in a simple alert for now
    // TODO: Create a proper info modal
    const info = `
Name: ${file.name}
Size: ${formatBytes(file.size)}
Type: ${file.mimeType}
Path: ${file.virtualPath}
Created: ${new Date(file.createdAt).toLocaleString()}
Modified: ${new Date(file.modifiedAt).toLocaleString()}
    `.trim();
    alert(info);
  };

  const handleUpload = useCallback(() => {
    if (!selectedLocation) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          await revfsManager.uploadFile(selectedLocation.cid, file, currentPath);
        } catch (error) {
          console.error('Failed to upload file:', error);
        }
      }
    };
    input.click();
  }, [selectedLocation, currentPath]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#1C1D28] border-[#262C4A] text-white sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#6E59A5]/20">
              <HardDrive className="h-5 w-5 text-purple-400" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              {viewMode === 'locations' ? 'File Manager' : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBack}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span>{selectedLocation?.name}</span>
                </div>
              )}
            </DialogTitle>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[400px] mt-4">
          {viewMode === 'locations' ? (
            // Storage Locations View
            <div className="space-y-3">
              {storageLocations.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No storage locations available</p>
                  <p className="text-sm mt-1">Connect to peers to see their storage</p>
                </div>
              ) : (
                storageLocations.map((location) => (
                  <div
                    key={location.cid}
                    className="flex items-center justify-between p-4 rounded-lg bg-[#262C4A] hover:bg-[#2a3050] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/5">
                        {location.type === 'server' ? (
                          <Server className="h-5 w-5 text-blue-400" />
                        ) : (
                          <User className="h-5 w-5 text-purple-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{location.name}</p>
                        <p className="text-sm text-gray-400">
                          {location.totalFiles} files · {formatBytes(location.usedBytes)} used
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!location.isConnected && (
                        <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                          Offline
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleBrowseLocation(location)}
                        disabled={!location.isConnected}
                        className="text-gray-300 hover:text-white"
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Browse
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            // Files View
            <div className="space-y-2">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">
                  {currentPath}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="text-gray-300 hover:text-white"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUpload}
                    className="text-gray-300 hover:text-white"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>
              </div>

              {/* File List */}
              {files.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No files in this location</p>
                  <p className="text-sm mt-1">Upload files to get started</p>
                </div>
              ) : (
                files.map((file) => (
                  <ContextMenu key={file.id}>
                    <ContextMenuTrigger>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-[#262C4A] hover:bg-[#2a3050] transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.mimeType)}
                          <div>
                            <p className="font-medium text-sm">{file.name}</p>
                            <p className="text-xs text-gray-400">
                              {formatBytes(file.size)} · {new Date(file.modifiedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="bg-[#1C1D28] border-[#262C4A] text-white">
                      <ContextMenuItem
                        onClick={() => handleOpenFile(file)}
                        className="flex items-center gap-2 cursor-pointer hover:bg-[#262C4A]"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => handleOpenAndDelete(file)}
                        className="flex items-center gap-2 cursor-pointer hover:bg-[#262C4A]"
                      >
                        <Download className="h-4 w-4" />
                        Open then Delete
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => handleFileInfo(file)}
                        className="flex items-center gap-2 cursor-pointer hover:bg-[#262C4A]"
                      >
                        <Info className="h-4 w-4" />
                        Info
                      </ContextMenuItem>
                      <ContextMenuSeparator className="bg-[#262C4A]" />
                      <ContextMenuItem
                        onClick={() => handleDeleteFile(file)}
                        className="flex items-center gap-2 cursor-pointer text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
