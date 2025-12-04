import React, { useState, useEffect, useRef, useCallback } from 'react';
import { P2PMessengerManager } from '@/lib/p2p-messenger-manager';
import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import { p2pAutoConnectService } from '@/lib/p2p-auto-connect-service';
import { eventEmitter } from '@/lib/event-emitter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, MessageCircle, CheckCheck, Check, Clock, RefreshCw, XCircle } from 'lucide-react';
import type { P2PMessage, PeerPresence } from '@/lib/p2p-messenger-manager';
import { MessagingLayerType } from '@/types/messaging-layer';

interface P2PChatProps {
  peerCid: string;
  peerName?: string;
  currentUserCid?: string;
  currentUserName?: string;
}

export function P2PChat({ peerCid, peerName = 'Peer', currentUserCid, currentUserName = 'You' }: P2PChatProps) {
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerPresence, setPeerPresence] = useState<PeerPresence>({
    status: MessagingLayerType.Offline,
    lastUpdate: 0
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Ref to always have latest inputMessage available for polling callback
  const inputMessageRef = useRef(inputMessage);

  const messenger = P2PMessengerManager.getInstance();

  // Can send messages if peer is registered (P2P connection is optional)
  const canSendMessages = isRegistered || isConnected;

  // Keep ref in sync with state
  useEffect(() => {
    inputMessageRef.current = inputMessage;
  }, [inputMessage]);
  
  // Handle demo peer messages
  const DEMO_MESSAGES: P2PMessage[] = peerCid === 'demo-peer-kathy' ? [
    {
      id: 'demo-1',
      senderCid: 'demo-peer-kathy',
      recipientCid: currentUserCid || 'user',
      content: 'Hey! How\'s the project going?',
      timestamp: Date.now() - 1000 * 60 * 5,
      status: 'delivered'
    },
    {
      id: 'demo-2',
      senderCid: currentUserCid || 'user',
      recipientCid: 'demo-peer-kathy',
      content: 'It\'s going great! Just finishing up the P2P messaging feature.',
      timestamp: Date.now() - 1000 * 60 * 4,
      status: 'delivered'
    },
    {
      id: 'demo-3',
      senderCid: 'demo-peer-kathy',
      recipientCid: currentUserCid || 'user',
      content: 'Awesome! Let me know if you need any help.',
      timestamp: Date.now() - 1000 * 60 * 3,
      status: 'delivered'
    }
  ] : [];

  useEffect(() => {
    // Handle empty peer selection
    if (!peerCid) {
      setMessages([]);
      return;
    }

    // Load demo messages for demo peer
    if (peerCid === 'demo-peer-kathy') {
      setMessages(DEMO_MESSAGES);
      setIsConnected(true);
      setPeerPresence({ status: MessagingLayerType.Online, lastUpdate: Date.now() });
    } else {
      // Load existing conversation after LocalDB is ready
      const loadConversation = async () => {
        await messenger.waitForReady();
        const conversation = messenger.getConversation(peerCid);
        if (conversation) {
          setMessages(conversation.messages);
          setPeerPresence(conversation.presence);
        }
      };
      loadConversation();
    }

    // Subscribe to new messages
    const unsubscribeMessage = messenger.onMessage((message) => {
      if (message.senderCid === peerCid || message.recipientCid === peerCid) {
        setMessages(prev => {
          // Deduplication: Check if message already exists by ID
          if (prev.some(m => m.id === message.id)) {
            return prev;  // Don't add duplicate
          }
          return [...prev, message];
        });

        // If this is an incoming message from the peer (not our own sent message),
        // mark it as read ONLY if the tab is currently visible (user can actually see it)
        if (message.senderCid === peerCid && peerCid !== 'demo-peer-kathy') {
          if (document.visibilityState === 'visible') {
            messenger.markMessagesAsRead(peerCid, [message.id]).catch(error => {
              console.error('Failed to mark message as read:', error);
            });
          }
          // If tab is not visible, the message will be marked as read when:
          // 1. User switches to this tab (via visibilitychange listener below)
          // 2. Or when conversation is re-opened
        }
      }
    });

    // Subscribe to message status changes (for read receipts)
    const unsubscribeStatusChange = messenger.onMessageStatusChange((messageId, status) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status } : m
      ));
    });

    // Subscribe to typing indicators
    const unsubscribeTyping = messenger.onTyping((cid, isTyping) => {
      if (cid === peerCid) {
        setPeerTyping(isTyping);
      }
    });

    // Subscribe to connection status
    const unsubscribeConnection = messenger.onConnectionChange((cid, connected) => {
      if (cid === peerCid) {
        setIsConnected(connected);
      }
    });

    // Subscribe to presence updates
    const unsubscribePresence = messenger.onPresenceChange((cid, presence) => {
      if (cid === peerCid) {
        setPeerPresence(presence);
      }
    });

    // Subscribe to peer registration events (enables input when peer registers with us)
    const unsubscribeRegistration = eventEmitter.on('p2p:peer-registered', ({ peer }: { peer: { cid: string } }) => {
      if (peer.cid === peerCid) {
        setIsRegistered(true);
        // Wake up auto-connect service to check for new peers to connect to
        p2pAutoConnectService.poll();
      }
    });

    // Check initial connection status
    setIsConnected(messenger.isConnected(peerCid));

    // Check initial registration status
    setIsRegistered(p2pRegistrationService.isPeerRegistered(peerCid));

    // Mark messages as read when conversation is viewed (only if tab is visible)
    if (peerCid !== 'demo-peer-kathy' && document.visibilityState === 'visible') {
      messenger.markMessagesAsRead(peerCid).catch(error => {
        console.error('Failed to mark messages as read:', error);
      });
    }

    // Listen for tab visibility changes - mark messages as read when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && peerCid !== 'demo-peer-kathy') {
        messenger.markMessagesAsRead(peerCid).catch(error => {
          console.error('Failed to mark messages as read on visibility change:', error);
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeMessage();
      unsubscribeStatusChange();
      unsubscribeTyping();
      unsubscribeConnection();
      unsubscribePresence();
      unsubscribeRegistration();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Stop typing polling when unmounting or changing peer
      messenger.stopTypingPolling(peerCid);
    };
  }, [peerCid]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // Stop typing polling when sending
    messenger.stopTypingPolling(peerCid);

    try {
      await messenger.sendMessage(peerCid, inputMessage);
      setInputMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  // Start typing polling when input is focused
  const handleInputFocus = useCallback(() => {
    if (peerCid && peerCid !== 'demo-peer-kathy') {
      messenger.startTypingPolling(peerCid, () => inputMessageRef.current);
    }
  }, [peerCid, messenger]);

  // Stop typing polling when input loses focus
  const handleInputBlur = useCallback(() => {
    if (peerCid) {
      messenger.stopTypingPolling(peerCid);
    }
  }, [peerCid, messenger]);

  // Retry sending a failed message
  const handleRetryMessage = useCallback(async (message: P2PMessage) => {
    if (message.status !== 'failed') return;
    try {
      await messenger.resendMessage(peerCid, message.id);
    } catch (error) {
      console.error('Failed to retry message:', error);
    }
  }, [peerCid, messenger]);

  // Helper to get combined status display with priority:
  // 1. P2P connected -> "Online" (green)
  // 2. Registered -> "Registered" (blue)
  // 3. Otherwise use presence status
  const getStatusDisplay = (presence: PeerPresence, connected: boolean, registered: boolean) => {
    // Priority 1: P2P connected always shows as Online
    if (connected) {
      return { text: 'Online', color: 'bg-green-500', textColor: 'text-green-400' };
    }

    // Priority 2: Registered but not connected
    if (registered) {
      return { text: 'Registered', color: 'bg-blue-500', textColor: 'text-blue-400' };
    }

    // Priority 3: Fall back to presence status
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
  };

  const getMessageStatus = (message: P2PMessage) => {
    switch (message.status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-gray-400" />;
      case 'sent':
        return <Check className="h-3 w-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-sky-400" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-red-400" />;
      default:
        return null;
    }
  };

  // Show placeholder when no peer is selected
  if (!peerCid) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#1C1D28]">
        <MessageCircle className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-500">Select a conversation to start messaging</p>
      </div>
    );
  }

  const statusDisplay = getStatusDisplay(peerPresence, isConnected, isRegistered);

  return (
    <div className="h-full flex flex-col bg-[#1C1D28]">
      <div className="border-b border-[#262C4A]/50 p-4 bg-[#1a1b26]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{peerName[0]}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-base font-semibold text-white">{peerName}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {/* Combined status indicator - no more contradictory displays */}
                <div
                  className={`h-2 w-2 rounded-full ${statusDisplay.color || ''}`}
                  style={statusDisplay.customColor ? { backgroundColor: statusDisplay.customColor } : undefined}
                />
                <span className={statusDisplay.textColor}>{statusDisplay.text}</span>
                {/* Typing indicator */}
                {peerTyping && (
                  <span className="ml-2 text-purple-400 animate-pulse">typing...</span>
                )}
              </div>
            </div>
          </div>
          {/* Status shown via dot indicator next to username - no manual buttons needed */}
        </div>
      </div>
      
      <div className="flex-1 p-0 flex flex-col">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => {
              const isOwn = message.senderCid === currentUserCid;
              const isFailed = message.status === 'failed';
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 ${
                      isOwn
                        ? isFailed
                          ? 'bg-[#4a3a5a] text-white border border-red-500/30'
                          : 'bg-[#6E59A5] text-white'
                        : 'bg-[#262C4A] text-gray-100'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <div className={`flex items-center gap-1 mt-1 ${
                      isOwn ? 'justify-end' : 'justify-start'
                    }`}>
                      <span className="text-xs opacity-70">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {isOwn && getMessageStatus(message)}
                      {/* Retry button for failed messages */}
                      {isOwn && isFailed && (
                        <button
                          onClick={() => handleRetryMessage(message)}
                          className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors"
                          title="Retry sending"
                        >
                          <RefreshCw className="h-3 w-3 text-red-400 hover:text-white" />
                        </button>
                      )}
                    </div>
                    {/* Error message for failed sends */}
                    {isOwn && isFailed && message.error && (
                      <p className="text-xs text-red-400 mt-1">{message.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-[#262C4A]/50 bg-[#1a1b26]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder="Type a message..."
              disabled={!canSendMessages}
              className="flex-1 bg-[#262C4A] border-[#3a3f5c] text-white placeholder-gray-400 focus:border-[#6E59A5]"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!canSendMessages || !inputMessage.trim()}
              className="bg-[#6E59A5] hover:bg-[#7c68d6] text-white"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}