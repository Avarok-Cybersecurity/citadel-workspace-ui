import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { p2pRegistrationService } from "@/lib/p2p-registration-service";
import { useToast } from "@/hooks/use-toast";
import { runAsyncSetup } from '@/lib/utils/async-utils';

interface ConnectionPreferences {
  autoAcceptRegistrations: boolean;
}

export const PreferencesDialog = () => {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<ConnectionPreferences>({
    autoAcceptRegistrations: false,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadPreferences = async () => {
      setLoading(true);
      try {
        const autoAcceptRegistrations = await p2pRegistrationService.getAutoAcceptSetting();
        setPreferences({ autoAcceptRegistrations });
      } catch (error) {
        console.error("Failed to load connection preferences:", error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      runAsyncSetup(loadPreferences);
    }
  }, [open]);

  const handleAutoAcceptChange = async (checked: boolean) => {
    setPreferences((prev) => ({ ...prev, autoAcceptRegistrations: checked }));
    try {
      await p2pRegistrationService.setAutoAcceptSetting(checked);
      toast({
        title: "Settings saved",
        description: `Auto-accept is now ${checked ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      console.error("Failed to update auto-accept preference:", error);
      // Revert the UI state on error
      setPreferences((prev) => ({ ...prev, autoAcceptRegistrations: !checked }));
      toast({
        title: "Failed to save",
        description: "Could not save your preference",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C]"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#343A5C] text-white border-purple-800 sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Connection Preferences</DialogTitle>
          <DialogDescription className="text-gray-300">
            Configure how you want to handle connection requests.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400"></div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-accept-registrations">Auto-accept registration requests</Label>
                <p className="text-xs text-gray-300">
                  Automatically accept P2P registration requests from new users
                </p>
              </div>
              <Switch
                id="auto-accept-registrations"
                checked={preferences.autoAcceptRegistrations}
                onCheckedChange={handleAutoAcceptChange}
              />
            </div>
            <div className="border-t border-gray-700 pt-4 mt-2">
              <p className="text-sm text-gray-300 mb-2">
                <strong>Note:</strong> P2P connection requests from registered users are automatically accepted.
              </p>
              <p className="text-sm text-gray-300">
                You'll still receive notifications for all requests, but they'll be handled according to your preferences.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PreferencesDialog;
