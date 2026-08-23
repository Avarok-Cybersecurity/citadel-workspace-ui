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
      <DialogContent className="bg-card text-foreground border-purple-800 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Profile Settings</DialogTitle>
          <DialogDescription className="text-foreground/80">
            Update your profile information
          </DialogDescription>
        </DialogHeader>
        <GeneralSettingsTab />
      </DialogContent>
    </Dialog>
  );
}
