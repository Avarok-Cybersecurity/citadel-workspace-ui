import { NotEnforcedNote } from './not-enforced-note';
import { SignInKeysSection } from '@/components/passkey/SignInKeysSection';
import { useState, useEffect } from 'react';
import { Eye, MessageSquare, Users } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ProfileVisibilityRow, StrangerRequestsRow } from './PrivacyServerRows';
import {
  getPrivacySettings,
  savePrivacySettings,
  PRIVACY_ENFORCEMENT,
  type PrivacySettings,
} from '@/lib/privacy-settings';

/**
 * The settings themselves live in `@/lib/privacy-settings`, which is what the
 * send paths read. This tab used to own them outright — writing localStorage and
 * dispatching an event nothing listened to — so every switch here was inert.
 */


export function PrivacySettingsTab(): JSX.Element {
  const [settings, setSettings] = useState<PrivacySettings>(getPrivacySettings);

  useEffect(() => {
    savePrivacySettings(settings);
  }, [settings]);

  const update = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]): void => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-5">
      <SignInKeysSection />

      {/* Visibility */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <Eye className="h-4 w-4 text-primary-accent" />
          Visibility
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div>
            <Label htmlFor="online-status" className="text-sm font-medium">Online Status</Label>
            <p className="text-xs text-muted-foreground">Tell your contacts when you come online or go away. Someone you are connected to directly can still see that connection.</p>
          </div>
          <Switch id="online-status"
            checked={settings.showOnlineStatus}
            onCheckedChange={(v) => update('showOnlineStatus', v)}
          />
        </div>

        <ProfileVisibilityRow />
      </div>

      {/* Messaging Privacy */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <MessageSquare className="h-4 w-4 text-primary-accent" />
          Messaging
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div>
            <Label htmlFor="typing-indicators" className="text-sm font-medium">Typing Indicators</Label>
            <p className="text-xs text-muted-foreground">Show when you're typing a message</p>
          </div>
          <Switch id="typing-indicators"
            checked={settings.showTypingIndicators}
            onCheckedChange={(v) => update('showTypingIndicators', v)}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div>
            <Label htmlFor="read-receipts" className="text-sm font-medium">Read Receipts</Label>
            <p className="text-xs text-muted-foreground">Let others know when you've read their messages</p>
          </div>
          <Switch id="read-receipts"
            checked={settings.sendReadReceipts}
            onCheckedChange={(v) => update('sendReadReceipts', v)}
          />
        </div>
      </div>

      {/* Access Control */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <Users className="h-4 w-4 text-primary-accent" />
          Access Control
        </div>

        <StrangerRequestsRow
          accepts={settings.acceptRequestsFromStrangers}
          onLocalChange={(v: boolean) => update('acceptRequestsFromStrangers', v)}
        />

        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
          <div>
            <Label htmlFor="screenshot-alerts" className="text-sm font-medium">Screenshot Alerts</Label>
            <p className="text-xs text-muted-foreground">Get notified if someone takes a screenshot</p>
            {/* A web page cannot observe a screenshot at all, so this one is not
                waiting on a server — it is waiting on a platform that can. */}
            {!PRIVACY_ENFORCEMENT.notifyOnScreenshot && <NotEnforcedNote />}
          </div>
          <Switch id="screenshot-alerts"
            disabled={!PRIVACY_ENFORCEMENT.notifyOnScreenshot}
            checked={settings.notifyOnScreenshot}
            onCheckedChange={(v) => update('notifyOnScreenshot', v)}
          />
        </div>
      </div>
    </div>
  );
}
