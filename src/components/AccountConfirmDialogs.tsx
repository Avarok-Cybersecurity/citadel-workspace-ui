/**
 * AccountConfirmDialogs Component
 *
 * Confirmation dialogs for account management:
 * - Remove single account confirmation
 * - Clear all accounts confirmation
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username?: string;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({ open, onOpenChange, username, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-surface">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Remove Account</AlertDialogTitle>
          <AlertDialogDescription className="text-foreground/80">
            Are you sure you want to remove {username} from your saved accounts?
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-gray-600 text-foreground/80 hover:bg-gray-700">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={onConfirm}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ClearAllConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ClearAllConfirmDialog({ open, onOpenChange, onConfirm }: ClearAllConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-surface">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Clear All Accounts</AlertDialogTitle>
          <AlertDialogDescription className="text-foreground/80">
            Are you sure you want to remove all saved accounts? This will sign you out and remove
            all stored credentials. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-gray-600 text-foreground/80 hover:bg-gray-700">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={onConfirm}>
            Clear All
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
