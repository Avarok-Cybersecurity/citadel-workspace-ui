import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { FileUploadService, UploadProgress } from '@/lib/file-upload-service';

interface FileUploadProgressProps {
  className?: string;
}

export const FileUploadProgress: React.FC<FileUploadProgressProps> = ({ className }) => {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);

  useEffect(() => {
    // Get initial active uploads
    setUploads(FileUploadService.getActiveUploads());

    // Listen for upload progress updates
    const handleProgress = (progress: UploadProgress) => {
      setUploads(current => {
        const index = current.findIndex(u => u.fileId === progress.fileId);
        if (index >= 0) {
          const updated = [...current];
          updated[index] = progress;
          return updated;
        }
        return [...current, progress];
      });

      // Remove completed/failed uploads after a delay
      if (progress.status === 'completed' || progress.status === 'failed') {
        setTimeout(() => {
          setUploads(current => current.filter(u => u.fileId !== progress.fileId));
        }, 3000);
      }
    };

    FileUploadService.on('upload-progress', handleProgress);

    return () => {
      FileUploadService.off('upload-progress', handleProgress);
    };
  }, []);

  const handleCancel = (fileId: string) => {
    FileUploadService.cancelUpload(fileId);
  };

  if (uploads.length === 0) {
    return null;
  }

  return (
    <div className={`fixed bottom-20 right-6 w-80 space-y-2 z-50 ${className}`}>
      {uploads.map((upload) => (
        <div
          key={upload.fileId}
          className="bg-[#262C4A] border border-[#262C4A]/50 rounded-lg p-4 shadow-lg"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              {upload.status === 'completed' && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              {upload.status === 'failed' && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm font-medium text-white">
                {upload.status === 'pending' && 'Preparing upload...'}
                {upload.status === 'uploading' && 'Uploading...'}
                {upload.status === 'completed' && 'Upload complete'}
                {upload.status === 'failed' && 'Upload failed'}
              </span>
            </div>
            {upload.status === 'uploading' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => handleCancel(upload.fileId)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          {upload.status === 'uploading' && (
            <div className="space-y-1">
              <Progress value={upload.progress} className="h-2" />
              <p className="text-xs text-gray-400">{upload.progress}%</p>
            </div>
          )}
          
          {upload.error && (
            <p className="text-xs text-red-400 mt-2">{upload.error}</p>
          )}
        </div>
      ))}
    </div>
  );
};