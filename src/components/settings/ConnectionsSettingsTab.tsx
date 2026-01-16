import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { serverAutoConnectService } from '@/lib/server-auto-connect-service';
import { Loader2 } from 'lucide-react';

export function ConnectionsSettingsTab() {
  const { toast } = useToast();
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const enabled = await serverAutoConnectService.getEnabled();
      setAutoReconnect(enabled);
    } catch (error) {
      console.error('Failed to load auto-reconnect setting:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setAutoReconnect(enabled);
    setSaving(true);

    try {
      await serverAutoConnectService.setEnabled(enabled);
      toast({
        title: enabled ? 'Auto-reconnect enabled' : 'Auto-reconnect disabled',
        description: enabled
          ? 'Sessions will automatically reconnect when disconnected.'
          : 'You will need to manually enter credentials to reconnect.',
      });
    } catch (error) {
      // Revert on error
      setAutoReconnect(!enabled);
      toast({
        title: 'Failed to save setting',
        description: 'Could not update auto-reconnect preference.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-lg bg-[#1a1b26] border border-[#262C4A]/50">
        <div className="space-y-0.5 flex-1 mr-4">
          <Label htmlFor="auto-reconnect" className="text-white font-medium cursor-pointer">
            Auto-reconnect
          </Label>
          <p className="text-xs text-gray-400">
            Automatically reconnect to servers when disconnected. When disabled, you will need to manually enter credentials each time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <Switch
            id="auto-reconnect"
            checked={autoReconnect}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}
