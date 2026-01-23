import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, Dialog } from '@/components/ui/dialog';
import { Image, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MediaUploaderProps {
  open: boolean;
  onClose: () => void;
  onMediaInsert: (markdownText: string) => void;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  open,
  onClose,
  onMediaInsert
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      (async () => {
        await handleFile(e.dataTransfer.files[0]);
      })().catch(console.error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      (async () => {
        await handleFile(e.target.files![0]);
      })().catch(console.error);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Unsupported file format',
        description: 'Please upload an image file (JPEG, PNG, GIF, etc.)',
        variant: 'destructive',
      });
      return;
    }

    // For larger applications, you'd upload the file to a server here
    // For now, we'll just use a data URL for demonstration
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage(reader.result as string);
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error handling file:', error);
      toast({
        title: 'Upload failed',
        description: 'There was a problem uploading your image',
        variant: 'destructive',
      });
      setUploading(false);
    }
  };

  const handleInsert = () => {
    if (!uploadedImage) return;
    
    // In a full implementation, this would be a URL to the uploaded image
    // on your server or storage service
    const mdxCode = `![${altText || 'Image'}](${uploadedImage})`;
    onMediaInsert(mdxCode);
    handleCancel();
  };

  const handleCancel = () => {
    setUploadedImage(null);
    setAltText('');
    onClose();
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-[#343A5C] text-white border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">Insert Media</DialogTitle>
          <DialogDescription className="text-gray-300">
            Upload an image to embed in your content
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {!uploadedImage ? (
            <div
              className={`border-2 border-dashed rounded-lg p-6 ${
                dragActive 
                  ? 'border-purple-500 bg-purple-900/20' 
                  : 'border-gray-600 hover:border-purple-400 hover:bg-purple-900/10'
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={handleButtonClick}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <Upload className="h-10 w-10 text-gray-400" />
                <p className="text-sm font-medium text-gray-300">
                  Drag and drop your image here or click to browse
                </p>
                <p className="text-xs text-gray-400">
                  Supports JPG, PNG, GIF up to 5MB
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <img 
                  src={uploadedImage} 
                  alt="Uploaded preview" 
                  className="rounded-md max-h-80 mx-auto object-contain" 
                />
                <button 
                  className="absolute top-2 right-2 rounded-full bg-gray-800/80 p-1 hover:bg-gray-700"
                  onClick={() => setUploadedImage(null)}
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="alt-text" className="text-sm font-medium text-gray-200">
                  Alt Text (Accessibility)
                </label>
                <input
                  id="alt-text"
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Describe this image for screen readers"
                  className="w-full px-3 py-2 bg-[#444A6C] border border-gray-700 rounded-md text-white"
                />
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="ghost" 
              onClick={handleCancel}
              className="text-gray-200 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleInsert}
              disabled={!uploadedImage || uploading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {uploading ? 'Uploading...' : 'Insert Image'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
