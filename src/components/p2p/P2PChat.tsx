import React, { useState, useEffect, useRef } from 'react';
import { P2PMessengerManager } from '@/lib/p2p-messenger-manager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, MessageCircle, CheckCheck, Check, Clock } from 'lucide-react';
import type { P2PMessage, P2PConversation } from '@/lib/p2p-messenger-manager';

interface P2PChatProps {
  peerCid: string;
  peerName?: string;
  currentUserCid?: string;
  currentUserName?: string;
}

export function P2PChat({ peerCid, peerName = 'Peer', currentUserCid, currentUserName = 'You' }: P2PChatProps) {
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  
  const messenger = P2PMessengerManager.getInstance();
  
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
    } else {
      // Load existing conversation
      const conversation = messenger.getConversation(peerCid);
      if (conversation) {
        setMessages(conversation.messages);
      }
    }

    // Subscribe to new messages
    const unsubscribeMessage = messenger.onMessage((message) => {
      if (message.senderCid === peerCid || message.recipientCid === peerCid) {
        setMessages(prev => [...prev, message]);
      }
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

    // Check initial connection status
    setIsConnected(messenger.isConnected(peerCid));

    // Mark messages as read when conversation is viewed
    if (peerCid !== 'demo-peer-kathy') {
      messenger.markMessagesAsRead(peerCid).catch(error => {
        console.error('Failed to mark messages as read:', error);
      });
    }

    return () => {
      unsubscribeMessage();
      unsubscribeTyping();
      unsubscribeConnection();
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

    try {
      await messenger.sendMessage(peerCid, inputMessage);
      setInputMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      messenger.sendTypingIndicator(peerCid, true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      messenger.sendTypingIndicator(peerCid, false);
    }, 1000);
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
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'failed':
        return <span className="text-xs text-red-500">Failed</span>;
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
                <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                {peerTyping && <span className="ml-2">typing...</span>}
              </div>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => messenger.autoRegisterPeer(peerCid)}
            title="Register peer"
            className="text-gray-400 hover:text-white"
          >
            <MessageCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="flex-1 p-0 flex flex-col">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => {
              const isOwn = message.senderCid === currentUserCid;
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 ${
                      isOwn
                        ? 'bg-[#6E59A5] text-white'
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
                    </div>
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
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                handleTyping();
              }}
              placeholder="Type a message..."
              disabled={!isConnected}
              className="flex-1 bg-[#262C4A] border-[#3a3f5c] text-white placeholder-gray-400 focus:border-[#6E59A5]"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!isConnected || !inputMessage.trim()}
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