import React, { useEffect, useState } from 'react';
import { FileText, Download, Trash2, FileImage, FileSpreadsheet, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  FileUploadService, 
  FileMetadata, 
  FileListRequest,
  FileDeleteRequest 
} from '@/lib/file-upload-service';
import { formatFileSize, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FileListProps {
  entityType: 'office' | 'room' | 'workspace' | 'p2p';
  entityId: string;
  onFileSelect?: (file: FileMetadata) => void;
  showActions?: boolean;
  className?: string;
}

export const FileList: React.FC<FileListProps> = ({
  entityType,
  entityId,
  onFileSelect,
  showActions = true,
  className
}) => {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadFiles();

    // Listen for file upload events
    const handleFileUploaded = (file: FileMetadata) => {
      if (file.entityType === entityType && file.entityId === entityId) {
        setFiles(prev => [...prev, file]);
      }
    };

    const handleFileDeleted = (fileId: string) => {
      setFiles(prev => prev.filter(f => f.id !== fileId));
    };

    FileUploadService.on('file-uploaded', handleFileUploaded);
    FileUploadService.on('file-deleted', handleFileDeleted);

    return () => {
      FileUploadService.off('file-uploaded', handleFileUploaded);
      FileUploadService.off('file-deleted', handleFileDeleted);
    };
  }, [entityType, entityId]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const request: FileListRequest = {
        entityType,
        entityId
      };
      const fileList = await FileUploadService.listFiles(request);
      setFiles(fileList);
    } catch (error) {
      console.error('Failed to load files:', error);
      toast({
        title: 'Failed to load files',
        description: 'Unable to retrieve file list',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteFileId) return;

    const request: FileDeleteRequest = {
      fileId: deleteFileId,
      entityType,
      entityId
    };

    try {
      const success = await FileUploadService.deleteFile(request);
      if (success) {
        toast({
          title: 'File deleted',
          description: 'The file has been removed'
        });
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: 'Unable to delete the file',
        variant: 'destructive'
      });
    } finally {
      setDeleteFileId(null);
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) return FileImage;
    if (fileType.includes('pdf')) return FileText;
    if (fileType.includes('sheet') || fileType.includes('excel')) return FileSpreadsheet;
    return File;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#6E59A5]"></div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className={`text-center p-8 text-gray-400 ${className}`}>
        <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No files uploaded yet</p>
      </div>
    );
  }

  return (
    <>
      <div className={`space-y-2 ${className}`}>
        {files.map((file) => {
          const Icon = getFileIcon(file.type);
          
          return (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-[#262C4A]/30 rounded-lg hover:bg-[#262C4A]/50 transition-colors cursor-pointer"
              onClick={() => onFileSelect?.(file)}
            >
              <div className="flex items-center space-x-3 flex-1">
                <Icon className="h-8 w-8 text-[#6E59A5]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(file.size)} • {formatDate(file.uploadedAt)} • {file.uploadedBy}
                  </p>
                </div>
              </div>
              
              {showActions && (
                <div className="flex items-center space-x-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Implement download
                      toast({
                        title: 'Download',
                        description: 'File download will be implemented soon'
                      });
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteFileId(file.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteFileId} onOpenChange={() => setDeleteFileId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};