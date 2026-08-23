import { useState, useEffect } from 'react';
import { Eye, MessageSquare, Users } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STORAGE_KEY = 'citadel:privacy-settings';

interface PrivacySettings {
  showOnlineStatus: boolean;
  showTypingIndicators: boolean;
  sendReadReceipts: boolean;
  allowDirectMessages: 'everyone' | 'connections' | 'nobody';
  showProfileToStrangers: boolean;
  notifyOnScreenshot: boolean;
}

const defaultSettings: PrivacySettings = {
  showOnlineStatus: true,
  showTypingIndicators: true,
  sendReadReceipts: true,
  allowDirectMessages: 'connections',
  showProfileToStrangers: false,
  notifyOnScreenshot: false,
};

function loadSettings(): PrivacySettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return defaultSettings;
}

function saveSettings(settings: PrivacySettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('privacy-settings-changed', { detail: settings }));
}

export function PrivacySettingsTab() {
  const [settings, setSettings] = useState<PrivacySettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-5">
      {/* Visibility */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <Eye className="h-4 w-4 text-purple-400" />
          Visibility
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1b26]/50">
          <div>
            <Label className="text-sm font-medium">Online Status</Label>
            <p className="text-xs text-gray-500">Let others see when you're online</p>
          </div>
          <Switch
            checked={settings.showOnlineStatus}
            onCheckedChange={(v) => update('showOnlineStatus', v)}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1b26]/50">
          <div>
            <Label className="text-sm font-medium">Profile Visibility</Label>
            <p className="text-xs text-gray-500">Show your profile to non-connected peers</p>
          </div>
          <Switch
            checked={settings.showProfileToStrangers}
            onCheckedChange={(v) => update('showProfileToStrangers', v)}
          />
        </div>
      </div>

      {/* Messaging Privacy */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <MessageSquare className="h-4 w-4 text-purple-400" />
          Messaging
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1b26]/50">
          <div>
            <Label className="text-sm font-medium">Typing Indicators</Label>
            <p className="text-xs text-gray-500">Show when you're typing a message</p>
          </div>
          <Switch
            checked={settings.showTypingIndicators}
            onCheckedChange={(v) => update('showTypingIndicators', v)}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1b26]/50">
          <div>
            <Label className="text-sm font-medium">Read Receipts</Label>
            <p className="text-xs text-gray-500">Let others know when you've read their messages</p>
          </div>
          <Switch
            checked={settings.sendReadReceipts}
            onCheckedChange={(v) => update('sendReadReceipts', v)}
          />
        </div>
      </div>

      {/* Access Control */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <Users className="h-4 w-4 text-purple-400" />
          Access Control
        </div>

        <div className="p-3 rounded-lg bg-[#1a1b26]/50">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Who Can Message You</Label>
              <p className="text-xs text-gray-500">Control who can send you direct messages</p>
            </div>
            <Select
              value={settings.allowDirectMessages}
              onValueChange={(v) => update('allowDirectMessages', v as PrivacySettings['allowDirectMessages'])}
            >
              <SelectTrigger className="w-32 h-8 bg-[#262C4A] border-[#3D4567] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="connections">Connections</SelectItem>
                <SelectItem value="nobody">Nobody</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-[#1a1b26]/50">
          <div>
            <Label className="text-sm font-medium">Screenshot Alerts</Label>
            <p className="text-xs text-gray-500">Get notified if someone takes a screenshot</p>
          </div>
          <Switch
            checked={settings.notifyOnScreenshot}
            onCheckedChange={(v) => update('notifyOnScreenshot', v)}
          />
        </div>
      </div>
    </div>
  );
}
