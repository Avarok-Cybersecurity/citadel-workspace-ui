/**
 * P2PChatHeader Component
 *
 * Displays the chat header with peer avatar, name, status, typing indicator,
 * and settings button.
 */

import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { CallEntryButtons } from '@/components/call/CallEntryButtons';
import { getInitials } from '@/components/chat/shared';
import { MessagingLayerType } from '@/types/messaging-layer';
import type { PeerPresence } from '@/lib/p2p';

interface P2PChatHeaderProps {
  peerName: string;
  peerPresence: PeerPresence;
  peerTyping: boolean;
  isConnected: boolean;
  isRegistered: boolean;
  onSettingsClick: () => void;
  /** Omitted where calling is not wired up, so the header stays usable. */
  call?: {
    canCall: boolean;
    inCall: boolean;
    capability: { supported: boolean; reason?: string };
    onStartCall: (video: boolean) => void;
    onLeave: () => void;
  };
}

interface StatusDisplay {
  text: string;
  color?: string;
  textColor: string;
  customColor?: string;
}

function getStatusDisplay(
  presence: PeerPresence,
  connected: boolean,
  registered: boolean
): StatusDisplay {
  if (connected) {
    return { text: 'Online', color: 'bg-success', textColor: 'text-success' };
  }
  if (registered) {
    return { text: 'Registered', color: 'bg-primary-accent', textColor: 'text-primary-accent' };
  }
  switch (presence.status) {
    case MessagingLayerType.Online:
      return { text: 'Online', color: 'bg-success', textColor: 'text-success' };
    case MessagingLayerType.Away:
      return { text: 'Away', color: 'bg-warning', textColor: 'text-warning' };
    case MessagingLayerType.Offline:
      return { text: 'Offline', color: 'bg-muted-foreground', textColor: 'text-muted-foreground' };
    case MessagingLayerType.CustomState:
      return {
        text: presence.customText || 'Custom',
        color: presence.customColor ? undefined : 'bg-primary',
        textColor: 'text-primary-accent',
        customColor: presence.customColor
      };
    default:
      return { text: 'Offline', color: 'bg-muted-foreground', textColor: 'text-muted-foreground' };
  }
}

export function P2PChatHeader({
  peerName,
  peerPresence,
  peerTyping,
  isConnected,
  isRegistered,
  onSettingsClick,
  call,
}: P2PChatHeaderProps) {
  const statusDisplay = getStatusDisplay(peerPresence, isConnected, isRegistered);

  return (
    <div className="border-b border-surface/50 p-4 bg-background">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback>{getInitials(peerName)}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="truncate text-base font-semibold text-foreground">{peerName}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div
                className={`h-2 w-2 rounded-full ${statusDisplay.color || ''}`}
                style={statusDisplay.customColor ? { backgroundColor: statusDisplay.customColor } : undefined}
              />
              <span className={statusDisplay.textColor}>{statusDisplay.text}</span>
              {peerTyping && (
                <span className="ml-2 text-primary-accent animate-pulse">typing...</span>
              )}
            </div>
          </div>
        </div>
        {/* One group, so justify-between has exactly TWO children to separate:
            identity on the left, actions on the right. With the call buttons as
            a third sibling they were distributed to the MIDDLE of the header —
            visibly wrong, and it grew worse as the peer name got shorter.
            shrink-0 keeps the actions intact when a long name runs out of room. */}
        <div className="flex shrink-0 items-center gap-1">
          {call && (
            <CallEntryButtons
              targetName={peerName}
              canCall={call.canCall}
              inCall={call.inCall}
              capability={call.capability}
              onStartCall={call.onStartCall}
              onLeave={call.onLeave}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettingsClick}
            className="text-muted-foreground hover:text-foreground hover:bg-surface"
            data-testid="chat-settings-button"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
