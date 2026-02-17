/**
 * PSK Dialog for AdvancedSettings.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  psk: string;
  onPskChange: (value: string) => void;
  onSave: () => void;
}

export const PskDialog = ({ open, onOpenChange, psk, onPskChange, onSave }: PskDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#282A42] text-white border-[#3D3F5A]">
        <DialogHeader>
          <DialogTitle>Enter Pre-Shared Key (PSK)</DialogTitle>
          <DialogDescription className="text-gray-300">
            Please enter your PSK for header obfuscation.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          placeholder="Enter your PSK"
          value={psk}
          onChange={(e) => onPskChange(e.target.value)}
          className="bg-[#3B3D57] border-[#4D4F6C] text-white"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-white hover:bg-purple-500/20"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={onSave}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
