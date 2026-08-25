import { useState, useEffect } from 'react';
import { Monitor, Type, Layout } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ThemeSelector } from './ThemeSelector';
import { WorkspaceAppearanceSection } from './WorkspaceAppearanceSection';

const STORAGE_KEY = 'citadel:appearance-settings';

interface AppearanceSettings {
  compactMode: boolean;
  fontSize: number;
  sidebarWidth: 'narrow' | 'default' | 'wide';
  showAvatars: boolean;
  animationsEnabled: boolean;
  messageGrouping: boolean;
}

const defaultSettings: AppearanceSettings = {
  compactMode: false,
  fontSize: 14,
  sidebarWidth: 'default',
  showAvatars: true,
  animationsEnabled: true,
  messageGrouping: true,
};

function loadSettings(): AppearanceSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return defaultSettings;
}

function saveSettings(settings: AppearanceSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  // Emit custom event so other components can react
  window.dispatchEvent(new CustomEvent('appearance-settings-changed', { detail: settings }));
}

export function AppearanceSettingsTab() {
  const [settings, setSettings] = useState<AppearanceSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
    // Apply font size to root
    document.documentElement.style.fontSize = `${settings.fontSize}px`;
    // Apply compact mode
    document.documentElement.classList.toggle('compact-mode', settings.compactMode);
    // Apply animations
    document.documentElement.classList.toggle('reduce-motion', !settings.animationsEnabled);
  }, [settings]);

  const update = <K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-5">
      <ThemeSelector />

      {/* The workspace's colours sit beside the personal light/dark choice: this
          is the one place a user asks "how does this look", and the adjacency
          makes the split legible. */}
      <WorkspaceAppearanceSection />

      {/* Display Density */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <Layout className="h-4 w-4 text-primary-accent" />
          Display
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div>
            <Label className="text-sm font-medium">Compact Mode</Label>
            <p className="text-xs text-muted-foreground">Reduce spacing between elements</p>
          </div>
          <Switch
            checked={settings.compactMode}
            onCheckedChange={(v) => update('compactMode', v)}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div>
            <Label className="text-sm font-medium">Show Avatars</Label>
            <p className="text-xs text-muted-foreground">Display user avatars in messages and lists</p>
          </div>
          <Switch
            checked={settings.showAvatars}
            onCheckedChange={(v) => update('showAvatars', v)}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div>
            <Label className="text-sm font-medium">Group Messages</Label>
            <p className="text-xs text-muted-foreground">Visually group consecutive messages from the same sender</p>
          </div>
          <Switch
            checked={settings.messageGrouping}
            onCheckedChange={(v) => update('messageGrouping', v)}
          />
        </div>
      </div>

      {/* Typography */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <Type className="h-4 w-4 text-primary-accent" />
          Typography
        </div>

        <div className="p-3 rounded-lg bg-background/50 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Font Size</Label>
            <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
          </div>
          <Slider
            value={[settings.fontSize]}
            onValueChange={([v]) => update('fontSize', v)}
            min={12}
            max={18}
            step={1}
            className="w-full"
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <Monitor className="h-4 w-4 text-primary-accent" />
          Layout
        </div>

        <div className="p-3 rounded-lg bg-background/50">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Sidebar Width</Label>
              <p className="text-xs text-muted-foreground">Adjust the navigation sidebar width</p>
            </div>
            <Select
              value={settings.sidebarWidth}
              onValueChange={(v) => update('sidebarWidth', v as AppearanceSettings['sidebarWidth'])}
            >
              <SelectTrigger className="w-28 h-8 bg-surface border-surface text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="narrow">Narrow</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="wide">Wide</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div>
            <Label className="text-sm font-medium">Animations</Label>
            <p className="text-xs text-muted-foreground">Enable smooth transitions and effects</p>
          </div>
          <Switch
            checked={settings.animationsEnabled}
            onCheckedChange={(v) => update('animationsEnabled', v)}
          />
        </div>
      </div>
    </div>
  );
}
