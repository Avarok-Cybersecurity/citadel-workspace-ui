import React from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { PermissionManager } from './PermissionManager';

interface PermissionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  domainId: string;
  domainType: string;
}

export const PermissionManagerModal: React.FC<PermissionManagerModalProps> = ({
  isOpen,
  onClose,
  userId,
  domainId,
  domainType,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* `sr-only` on the default Radix close button keeps the dialog's
          built-in dismiss control in the keyboard tab order and the
          a11y tree (so screen-reader users can still close the modal)
          while leaving the borderless overlay design intact. The
          earlier `[&>button]:hidden` removed the button entirely and
          left only the Escape key as a dismiss path. */}
      {/* Width tuned to comfortably fit PermissionManager's 5-column
          permission matrix (200px label column + 4 role columns at
          min-w-[90px] each, plus padding). max-w-2xl (672px) sat right
          at the layout's minimum and would have started horizontally
          scrolling the matrix on the smallest viewport sizes; max-w-3xl
          (768px) gives ~96px of slack so a future role addition or a
          longer permission label doesn't immediately overflow. */}
      <DialogContent className="max-w-3xl p-0 bg-transparent border-0 shadow-none [&>button]:sr-only">
        <PermissionManager
          userId={userId}
          domainId={domainId}
          domainType={domainType}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
};
