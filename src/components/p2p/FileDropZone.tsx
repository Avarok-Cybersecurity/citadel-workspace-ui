import { Upload, FolderOpen, FileImage, FileText, FileVideo, FileAudio, File, X } from 'lucide-react';

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <FileImage className="h-8 w-8 text-purple-400" />;
  if (mimeType.startsWith('video/')) return <FileVideo className="h-8 w-8 text-blue-400" />;
  if (mimeType.startsWith('audio/')) return <FileAudio className="h-8 w-8 text-green-400" />;
  if (mimeType.startsWith('text/') || mimeType.includes('pdf')) return <FileText className="h-8 w-8 text-orange-400" />;
  return <File className="h-8 w-8 text-gray-400" />;
}

interface FileDropZoneProps {
  selectedFile: File | null;
  previewUrl: string | null;
  isDragging: boolean;
  isSending: boolean;
  isPickingFile: boolean;
  nativePickerAvailable: boolean | null;
  maxFileSizeBytes: number;
  formatBytes: (bytes: number) => string;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onBrowseClick: () => void;
  onNativePickerClick: () => void;
  onRemoveFile: () => void;
}

export function FileDropZone({
  selectedFile,
  previewUrl,
  isDragging,
  isSending,
  isPickingFile,
  nativePickerAvailable,
  maxFileSizeBytes,
  formatBytes,
  onDrop,
  onDragOver,
  onDragLeave,
  onBrowseClick,
  onNativePickerClick,
  onRemoveFile,
}: FileDropZoneProps) {
  if (selectedFile) {
    return (
      <div className="bg-[#262C4A] rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={selectedFile.name}
                className="h-16 w-16 object-cover rounded-lg"
              />
            ) : (
              <div className="h-16 w-16 flex items-center justify-center bg-[#1C1D28] rounded-lg">
                {getFileIcon(selectedFile.type)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{selectedFile.name}</p>
            <p className="text-xs text-gray-400 mt-1">
              {formatBytes(selectedFile.size)} • {selectedFile.type || 'Unknown type'}
            </p>
          </div>
          <button
            onClick={onRemoveFile}
            className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            disabled={isSending}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {nativePickerAvailable !== false && (
        <button
          onClick={onNativePickerClick}
          disabled={isPickingFile || isSending}
          className="w-full flex items-center gap-3 p-4 rounded-lg border border-[#6E59A5] bg-[#6E59A5]/10 hover:bg-[#6E59A5]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="p-2 rounded-lg bg-[#6E59A5]/20">
            <FolderOpen className="h-5 w-5 text-purple-400" />
          </div>
          <div className="flex-1 text-left">
            <span className="font-medium text-white">
              {isPickingFile ? 'Opening file picker...' : 'Browse Files'}
            </span>
            <p className="text-xs text-gray-400 mt-0.5">
              Uses native file picker with full path access
            </p>
          </div>
        </button>
      )}

      {nativePickerAvailable !== false && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-[#3a3f5c]" />
          <span className="text-xs text-gray-500">or</span>
          <div className="flex-1 h-px bg-[#3a3f5c]" />
        </div>
      )}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onBrowseClick}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-[#3a3f5c] hover:border-[#6E59A5] hover:bg-[#262C4A]'
        }`}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-300">
          Drop file here or <span className="text-purple-400">browse</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Maximum file size: {formatBytes(maxFileSizeBytes)}
        </p>
      </div>
    </div>
  );
}
