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
      <DialogContent className="max-w-2xl p-0 bg-transparent border-0 shadow-none [&>button]:hidden">
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
