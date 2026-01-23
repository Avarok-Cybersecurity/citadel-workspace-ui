import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fileUploadService, FileUploadRequest } from '@/lib/file-upload-service';
import { useToast } from '@/hooks/use-toast';

interface FileUploadButtonProps {
  entityType: 'office' | 'room' | 'workspace' | 'p2p';
  entityId: string;
  onUploadComplete?: (fileId: string) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // in MB
  className?: string;
}

export const FileUploadButton: React.FC<FileUploadButtonProps> = ({
  entityType,
  entityId,
  onUploadComplete,
  accept,
  multiple = false,
  maxSize = 50,
  className
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesToUpload = Array.from(files);
    const maxSizeBytes = maxSize * 1024 * 1024;

    for (const file of filesToUpload) {
      // Check file size
      if (file.size > maxSizeBytes) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds the maximum size of ${maxSize}MB`,
          variant: 'destructive'
        });
        continue;
      }

      // Create upload request
      const request: FileUploadRequest = {
        file,
        entityType,
        entityId
      };

      try {
        // Start upload
        const response = await fileUploadService.uploadFile(request);
        
        if (response.success && response.fileId) {
          toast({
            title: 'Upload successful',
            description: `${file.name} has been uploaded`
          });
          
          if (onUploadComplete) {
            onUploadComplete(response.fileId);
          }
        } else {
          toast({
            title: 'Upload failed',
            description: response.error || 'Failed to upload file',
            variant: 'destructive'
          });
        }
      } catch (error) {
        console.error('Upload error:', error);
        toast({
          title: 'Upload failed',
          description: 'An unexpected error occurred',
          variant: 'destructive'
        });
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        className={className}
      >
        <Upload className="h-4 w-4 mr-2" />
        Upload File
      </Button>
    </>
  );
};