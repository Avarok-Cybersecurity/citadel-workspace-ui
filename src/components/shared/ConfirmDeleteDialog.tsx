import { ReactNode, useCallback, useState } from 'react';
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
  /**
   * May be async. The dialog stays open until it settles, so a caller can show
   * the failure reason inside this dialog instead of losing it to a closed one.
   */
  onConfirm: () => void | Promise<void>;
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
}: ConfirmDeleteDialogProps): JSX.Element {
  const [pending, setPending] = useState(false);

  // AlertDialogAction IS a Radix Close: without preventDefault the dialog shuts
  // on the click, before an async onConfirm settles. Every caller here already
  // closes itself from its own state, and one of them renders its error message
  // into this dialog's description — unreachable while Radix closed it first.
  const handleConfirm: (event: React.MouseEvent) => void = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (pending) return;
      const result: void | Promise<void> = onConfirm();
      if (!(result instanceof Promise)) return;
      setPending(true);
      void result.finally(() => setPending(false));
    },
    [onConfirm, pending],
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-border">
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
          <AlertDialogCancel
            disabled={pending}
            className="bg-transparent border-border text-foreground hover:bg-card"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
