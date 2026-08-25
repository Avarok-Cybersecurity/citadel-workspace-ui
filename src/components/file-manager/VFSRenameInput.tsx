/**
 * VFSRenameInput Component
 *
 * Inline input for renaming files and folders in the file manager.
 * Renders in place of the item name when in rename mode.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';

interface VFSRenameInputProps {
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
  isDirectory?: boolean;
}

export function VFSRenameInput({
  currentName,
  onConfirm,
  onCancel,
  isDirectory = false,
}: VFSRenameInputProps) {
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (!isDirectory && currentName.includes('.')) {
        const dotIndex = currentName.lastIndexOf('.');
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, [currentName, isDirectory]);

  const validate = useCallback((name: string): string | null => {
    if (!name.trim()) {
      return 'Name cannot be empty';
    }
    if (name.includes('/') || name.includes('\\')) {
      return 'Name cannot contain slashes';
    }
    if (name === '.' || name === '..') {
      return 'Invalid name';
    }
    if (name.length > 255) {
      return 'Name too long';
    }
    return null;
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmed = value.trim();
    const validationError = validate(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (trimmed === currentName) {
      onCancel();
      return;
    }
    onConfirm(trimmed);
  }, [value, currentName, validate, onConfirm, onCancel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    e.stopPropagation();
  }, [handleConfirm, onCancel]);

  const handleBlur = useCallback(() => {
    handleConfirm();
  }, [handleConfirm]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setError(null);
  }, []);

  return (
    <div className="flex flex-col">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`h-6 px-1 py-0 text-xs bg-surface border ${
          error ? 'border-destructive' : 'border-primary-accent'
        } text-foreground focus:ring-1 focus:ring-ring`}
        onClick={(e) => e.stopPropagation()}
      />
      {error && (
        <span className="text-xs text-destructive mt-0.5">{error}</span>
      )}
    </div>
  );
}
