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
    return { text: 'Online', color: 'bg-green-500', textColor: 'text-green-400' };
  }
  if (registered) {
    return { text: 'Registered', color: 'bg-blue-500', textColor: 'text-blue-400' };
  }
  switch (presence.status) {
    case MessagingLayerType.Online:
      return { text: 'Online', color: 'bg-green-500', textColor: 'text-green-400' };
    case MessagingLayerType.Away:
      return { text: 'Away', color: 'bg-yellow-500', textColor: 'text-yellow-400' };
    case MessagingLayerType.Offline:
      return { text: 'Offline', color: 'bg-gray-400', textColor: 'text-gray-400' };
    case MessagingLayerType.CustomState:
      return {
        text: presence.customText || 'Custom',
        color: presence.customColor ? undefined : 'bg-purple-500',
        textColor: 'text-purple-400',
        customColor: presence.customColor
      };
    default:
      return { text: 'Offline', color: 'bg-gray-400', textColor: 'text-gray-400' };
  }
}

export function P2PChatHeader({
  peerName,
  peerPresence,
  peerTyping,
  isConnected,
  isRegistered,
  onSettingsClick,
}: P2PChatHeaderProps) {
  const statusDisplay = getStatusDisplay(peerPresence, isConnected, isRegistered);

  return (
    <div className="border-b border-[#262C4A]/50 p-4 bg-[#1a1b26]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{getInitials(peerName)}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-base font-semibold text-white">{peerName}</h3>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div
                className={`h-2 w-2 rounded-full ${statusDisplay.color || ''}`}
                style={statusDisplay.customColor ? { backgroundColor: statusDisplay.customColor } : undefined}
              />
              <span className={statusDisplay.textColor}>{statusDisplay.text}</span>
              {peerTyping && (
                <span className="ml-2 text-purple-400 animate-pulse">typing...</span>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettingsClick}
          className="text-gray-400 hover:text-white hover:bg-[#262C4A]"
          data-testid="chat-settings-button"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
