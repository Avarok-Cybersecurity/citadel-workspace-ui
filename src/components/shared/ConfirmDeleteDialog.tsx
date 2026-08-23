import { ReactNode } from 'react';
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

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onConfirm: () => void;
  description?: ReactNode;
  confirmLabel?: string;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
  description,
  confirmLabel = 'Delete',
}: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-purple-800">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-foreground/80">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-gray-600 text-foreground hover:bg-card">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 text-foreground hover:bg-red-700"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
