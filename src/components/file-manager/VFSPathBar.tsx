import { useState, useCallback, useRef, useEffect , type RefObject } from 'react';
import { FolderOpen } from 'lucide-react';
import type { RevfsNode } from '@/types/revfs-types';
import { pathExists } from '@/lib/revfs/tree-operations';
import { cn } from '@/lib/utils';
import { isEnterCommit } from '@/lib/keyboard-commit';

interface VFSPathBarProps {
  /** Current path being viewed */
  currentPath: string;
  /** Called when user navigates to a valid path */
  onNavigate: (path: string) => void;
  /** Tree used for path validation */
  tree: RevfsNode;
}

/**
 * Editable path bar for RE-VFS navigation.
 * Shows current path and allows direct navigation via text input.
 *
 * Features:
 * - Enter key navigates (validates path exists first)
 * - Escape or blur reverts to current path if not submitted
 * - Error shake animation if invalid path
 */
export function VFSPathBar({ currentPath, onNavigate, tree }: VFSPathBarProps): JSX.Element {
  const [inputValue, setInputValue] = useState(currentPath);
  const [isEditing, setIsEditing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const inputRef: RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);

  // Sync input with current path when it changes externally
  useEffect(() => {
    if (!isEditing) {
      setInputValue(currentPath);
    }
  }, [currentPath, isEditing]);

  // Clear error state after animation
  useEffect(() => {
    if (hasError) {
      const timeout: NodeJS.Timeout = setTimeout((): void => setHasError(false), 500);
      return (): void => clearTimeout(timeout);
    }
  }, [hasError]);

  const handleFocus: () => void = useCallback((): void => {
    setIsEditing(true);
    // Select all text on focus for easy replacement
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const handleBlur: () => void = useCallback((): void => {
    setIsEditing(false);
    // Revert to current path on blur without submission
    setInputValue(currentPath);
    setHasError(false);
  }, [currentPath]);

  const handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (isEnterCommit(e)) {
      e.preventDefault();
      const normalizedPath: string = inputValue.trim() || '/';

      // Validate path exists in tree
      if (pathExists(tree, normalizedPath)) {
        setIsEditing(false);
        onNavigate(normalizedPath);
        inputRef.current?.blur();
      } else {
        // Trigger error shake
        setHasError(true);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
      setInputValue(currentPath);
      setHasError(false);
      inputRef.current?.blur();
    }
  }, [inputValue, tree, currentPath, onNavigate]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setInputValue(e.target.value);
    setHasError(false);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface">
      <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground shrink-0">Path:</span>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex-1 bg-card text-foreground text-sm px-3 py-1.5 rounded border border-transparent',
          'focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-ring/50',
          'placeholder:text-muted-foreground',
          hasError && 'animate-shake border-destructive focus:border-destructive focus:ring-destructive/50'
        )}
        placeholder="/"
        spellCheck={false}
        autoComplete="off"
      />
      {hasError && (
        <span className="text-xs text-destructive-emphasis shrink-0">Path not found</span>
      )}
    </div>
  );
}
