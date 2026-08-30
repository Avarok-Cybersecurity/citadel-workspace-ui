/**
 * The Advanced tab's three settings, none of which this build can act on.
 *
 * Extracted for the length cap, and they belong together for a better reason:
 * each was uncontrolled -- `defaultValue`, no `value`, no `onChange`, no store,
 * no consumer -- so choosing "Maximum" encryption, "Server First" routing or a
 * retention period changed nothing. The retention slider's "90 days" is static
 * text, so dragging it did not even move the number it claimed to set.
 *
 * The comment on the switches in the General tab says why that is not tolerable
 * here: "On a product whose subject is privacy, a switch that lies about what
 * you are broadcasting is the worst kind to fake." Those switches were fixed;
 * these three were left, one of them labelled "Encryption Level: Security level
 * for this conversation".
 *
 * Disabled and labelled until something is behind them -- the pattern
 * `PrivacySettingsTab` already uses for exactly this case.
 */
import { Sliders, Settings, MessageSquare } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { NotEnforcedNote } from '@/components/settings/not-enforced-note';

export function ChatSettingsAdvanced(): JSX.Element {
  return (
    <>
        <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
          <div className="flex items-center gap-3">
            <Sliders className="h-5 w-5 text-warning-emphasis" />
            <div>
              <Label htmlFor="encryption-level" className="text-sm font-medium">Encryption Level</Label>
              <p className="text-xs text-muted-foreground">Security level for this conversation</p>
              <NotEnforcedNote />
            </div>
          </div>
          <select id="encryption-level"
            className="bg-surface border border-surface rounded px-2 py-1 text-sm text-foreground/80"
            defaultValue="standard"
            disabled
          >
            <option value="standard">Standard</option>
            <option value="high">High</option>
            <option value="maximum">Maximum</option>
          </select>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-surface/50">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-primary-accent" />
            <div>
              <Label htmlFor="connection-priority" className="text-sm font-medium">Connection Priority</Label>
              <p className="text-xs text-muted-foreground">Prefer direct P2P or server relay</p>
              <NotEnforcedNote />
            </div>
          </div>
          <select id="connection-priority"
            className="bg-surface border border-surface rounded px-2 py-1 text-sm text-foreground/80"
            defaultValue="p2p"
            disabled
          >
            <option value="p2p">P2P First</option>
            <option value="server">Server First</option>
            <option value="auto">Auto</option>
          </select>
        </div>

        <div className="p-4 rounded-lg bg-surface/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-success-emphasis" />
              <div>
                <Label htmlFor="message-retention" className="text-sm font-medium">Message Retention</Label>
                <p className="text-xs text-muted-foreground">Days to keep message history locally</p>
                <NotEnforcedNote />
              </div>
            </div>
            <span className="text-sm text-muted-foreground">90 days</span>
          </div>
          <input id="message-retention"
            type="range"
            min={7}
            max={365}
            defaultValue={90}
            disabled
            className="w-full accent-primary-accent disabled:opacity-60"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>7 days</span>
            <span>1 year</span>
          </div>
        </div>
    </>
  );
}
