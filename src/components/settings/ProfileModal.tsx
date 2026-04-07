import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GeneralSettingsTab } from './GeneralSettingsTab';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#232536] text-white border-purple-800 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Profile Settings</DialogTitle>
          <DialogDescription className="text-gray-300">
            Update your profile information
          </DialogDescription>
        </DialogHeader>
        <GeneralSettingsTab />
      </DialogContent>
    </Dialog>
  );
}
