/**
 * The Advanced tab. Message retention is enforced (useChatAdvancedSettings,
 * lib/p2p/retention-sweep); encryption level and connection priority are not,
 * and say so.
 *
 * All three were uncontrolled -- `defaultValue`, no `onChange`, no store -- and
 * then disabled with a "not enforced" note. The note now sits only where it is
 * still true:
 *
 * - Encryption level: the client plumbing exists (PeerConnect asks for the
 *   chat's level, offers below it are declined, messages carry it), but the
 *   pinned SDK cannot honour it. A P2P level above the login's level ends the
 *   whole server session ("Only have max 0 security levels"), and a message
 *   sent at a level above its channel's is delivered anyway. Both are pinned in
 *   citadel-internal-service/tests/peer_security_level.rs. Enabling this before
 *   the SDK is fixed would log users out and promise layers it does not add.
 * - Connection priority: the relay policy must be the same on both peers
 *   (`PeerTurnConfig`), the offer a peer receives does not carry the policy its
 *   initiator used, and without a relay grant "relay only" would silently
 *   become a direct connection.
 */
import { Sliders, Settings, MessageSquare } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { NotEnforcedNote } from '@/components/settings/not-enforced-note';
import {
  RETENTION_CHOICES,
  type Retention,
} from '@/lib/p2p/chat-advanced-settings';
import { useChatAdvancedSettings, type ChatAdvancedControls } from './useChatAdvancedSettings';

const SELECT_CLASS: string = 'bg-surface border border-surface rounded px-2 py-1 text-sm text-foreground/80';

function retentionLabel(r: Retention): string {
  if (r === 'forever') return 'Keep everything';
  if (r === 1) return '1 day';
  if (r === 365) return '1 year';
  return `${r} days`;
}

interface ChatSettingsAdvancedProps {
  isOpen: boolean;
  peerCid: bigint;
  peerName: string;
}

export function ChatSettingsAdvanced({ isOpen, peerCid, peerName }: ChatSettingsAdvancedProps): JSX.Element {
  const { settings, status, error, changeRetention }: ChatAdvancedControls = useChatAdvancedSettings(isOpen, peerCid);
  return (
    <>
        <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-surface/50">
          <div className="flex items-center gap-3">
            <Sliders className="h-5 w-5 text-warning-emphasis shrink-0" />
            <div>
              <Label htmlFor="encryption-level" className="text-sm font-medium">Encryption Level</Label>
              <p className="text-xs text-muted-foreground">
                Every chat uses the protocol's Standard level today. A higher per-chat level
                needs a fix in the underlying protocol first: asking for one would currently
                disconnect you from the server.
              </p>
              <NotEnforcedNote />
            </div>
          </div>
          <select id="encryption-level" className={SELECT_CLASS} defaultValue="Standard" disabled>
            <option value="Standard">Standard</option>
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
          <select id="connection-priority" className={SELECT_CLASS} defaultValue="p2p" disabled>
            <option value="p2p">P2P First</option>
            <option value="server">Server First</option>
            <option value="auto">Auto</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-surface/50">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-success-emphasis shrink-0" />
            <div>
              <Label htmlFor="message-retention" className="text-sm font-medium">Message Retention</Label>
              <p className="text-xs text-muted-foreground">
                Messages older than this are deleted from this device when you open the chat
                and every hour. {peerName}'s copy is not affected.
              </p>
            </div>
          </div>
          <select id="message-retention" className={SELECT_CLASS}
            value={settings === null ? '' : String(settings.retention)}
            disabled={settings === null}
            onChange={(e): void => {
              const chosen: Retention | undefined = RETENTION_CHOICES.find((r: Retention): boolean => String(r) === e.target.value);
              if (chosen !== undefined) void changeRetention(chosen);
            }}
          >
            {settings === null && <option value="">Loading…</option>}
            {RETENTION_CHOICES.map((r: Retention) => <option key={String(r)} value={String(r)}>{retentionLabel(r)}</option>)}
          </select>
        </div>

        {status && <p className="text-xs text-muted-foreground px-1" role="status">{status}</p>}
        {error && <p className="text-xs text-destructive px-1" role="alert">{error}</p>}
    </>
  );
}
