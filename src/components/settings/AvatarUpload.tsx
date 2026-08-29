import { useState, useRef, useCallback } from 'react';
import { Upload, X, User } from 'lucide-react';
import { processAvatarImage, validateAvatarFile, avatarToDataUrl } from '@/lib/image-processor';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { activateOnKey } from '@/lib/a11y';

interface AvatarUploadProps {
  currentAvatar?: string; // Base64-encoded current avatar
  onAvatarChange: (base64Data: string | null) => void;
  disabled?: boolean;
}

export function AvatarUpload({ currentAvatar, onAvatarChange, disabled = false }: AvatarUploadProps): JSX.Element {
  const [preview, setPreview] = useState<string | null>(
    currentAvatar ? avatarToDataUrl(currentAvatar) : null
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile: (file: File) => Promise<void> = useCallback(async (file: File): Promise<void> => {
    setError(null);

    // Validate file
    const validation = validateAvatarFile(file);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    setIsProcessing(true);
    try {
      const base64: string = await processAvatarImage(file);
      const dataUrl: string = avatarToDataUrl(base64);
      setPreview(dataUrl);
      onAvatarChange(base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  }, [onAvatarChange]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (disabled) return;

    const file: File = e.dataTransfer.files[0];
    if (file) {
      runAsyncSetup(async () => {
        await handleFile(file);
      });
    }
  }, [disabled, handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragActive(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleClick: () => void = useCallback((): void => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const file: File | undefined = e.target.files?.[0];
    if (file) {
      runAsyncSetup(async () => {
        await handleFile(file);
      });
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [handleFile]);

  const handleRemove: (e: React.MouseEvent) => void = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
    setPreview(null);
    setError(null);
    onAvatarChange(null);
  }, [onAvatarChange]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        onClick={handleClick}
        role="button"
        tabIndex={0}
        // Its only content is the preview image or a placeholder icon, so
        // without this a screen reader announces "button" and nothing else.
        aria-label={preview ? 'Change profile picture' : 'Upload profile picture'}
        aria-disabled={disabled}
        onKeyDown={activateOnKey(handleClick)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative w-32 h-32 rounded-full overflow-hidden cursor-pointer
          border-2 border-dashed transition-all duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragActive ? 'border-primary-accent bg-primary-accent/10' : 'border-border hover:border-border'}
          ${isProcessing ? 'animate-pulse' : ''}
        `}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Avatar preview"
              className="w-full h-full object-cover"
            />
            {!disabled && (
              <button
                aria-label="Remove avatar"
                onClick={handleRemove}
                className="absolute top-0 right-0 p-1 bg-destructive rounded-full transform translate-x-1/4 -translate-y-1/4 hover:bg-destructive transition-colors"
              >
                <X className="h-3 w-3 text-foreground" />
              </button>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-muted">
            {isProcessing ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-accent" />
            ) : (
              <>
                <User className="h-12 w-12 text-muted-foreground" />
                <Upload className="h-5 w-5 text-muted-foreground mt-1" />
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {isDragActive ? 'Drop image here' : 'Click or drag to upload'}
      </p>

      {error && (
        <p role="alert" className="text-xs text-destructive-emphasis">{error}</p>
      )}
    </div>
  );
}
