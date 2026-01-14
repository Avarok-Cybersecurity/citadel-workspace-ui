import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { eventEmitter } from '@/lib/event-emitter';
import { broadcastChannelService } from '@/lib/broadcast-channel-service';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const LeaderIndicator: React.FC = () => {
  const [isLeader, setIsLeader] = useState(false);
  const [tabId, setTabId] = useState('');

  useEffect(() => {
    // Get initial state
    setIsLeader(broadcastChannelService.getIsLeader());
    setTabId(broadcastChannelService.getTabId());

    // Listen for leader changes
    const handleLeaderChange = ({ isLeader: newIsLeader, leaderId }: { isLeader: boolean; leaderId: string }) => {
      setIsLeader(newIsLeader);
      if (newIsLeader) {
        setTabId(leaderId);
      }
    };

    eventEmitter.on('leader-changed', handleLeaderChange);

    return () => {
      eventEmitter.off('leader-changed', handleLeaderChange);
    };
  }, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-opacity-20">
            {isLeader ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-xs text-green-500 font-medium">Leader</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-gray-500" />
                <span className="text-xs text-gray-500 font-medium">Follower</span>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p className="font-medium">{isLeader ? 'This tab is the leader' : 'This tab is a follower'}</p>
            <p className="text-muted-foreground">
              {isLeader
                ? 'Managing WebSocket connection for all tabs'
                : 'Receiving updates from the leader tab'}
            </p>
            <p className="text-muted-foreground mt-1">Tab ID: {tabId.substring(0, 8)}...</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};