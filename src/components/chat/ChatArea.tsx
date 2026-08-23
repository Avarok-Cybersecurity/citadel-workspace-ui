import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Bell, Search, Shield, MoreVertical, Upload, ChevronDown } from "lucide-react";
// Removed messageChannels import - now handled internally
import { useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "../../lib/date-utils";
import { RetryableMessageSender } from "./RetryableMessageSender";
import { TypingIndicator } from "./TypingIndicator";
import { MessagingService, Message as MessageType } from "../../lib/messaging-service";
import { connectionManager } from '@/lib/connection';

interface Message {
  id?: string;
  content: string;
  timestamp: number;
  pending?: boolean;
  sender: {
    id: string;
    name: string;
    avatar: string;
  };
}

interface ChatAreaProps {
  recipientId: string;
}

export const ChatArea = ({ recipientId }: ChatAreaProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagingService = MessagingService.getInstance();

  // Get real user info from connection
  const connectionInfo = connectionManager.getConnectionInfo();
  const currentUserId = connectionInfo?.cid ? String(connectionInfo.cid) : 'current-user';

  // Initialize with any existing messages from the current conversation
  useEffect(() => {
    setMessages([]);

    // Set up handlers for new messages and typing indicators
    const handleNewMessage = (message: MessageType) => {
      if (message.recipientId === currentUserId && message.senderId === recipientId) {
        const newMessage: Message = {
          id: message.id,
          content: message.content,
          timestamp: message.timestamp,
          sender: {
            id: message.senderId,
            name: getPeerName(message.senderId),
            avatar: ''
          }
        };
        setMessages(prev => [...prev, newMessage]);
      } else if (message.senderId === currentUserId && message.recipientId === recipientId) {
        setMessages(prev => prev.map(msg =>
          msg.id === message.id
            ? {
              ...msg,
              pending: message.status === 'pending',
              error: message.status === 'failed' ? message.error : undefined
            }
            : msg
        ));
      }
    };

    const handleTypingStatus = (peerId: string, typing: boolean) => {
      if (peerId === recipientId) {
        setIsTyping(typing);
      }
    };

    messagingService.setMessageReceivedHandler(handleNewMessage);
    messagingService.setTypingStatusHandler(handleTypingStatus);

    return () => {
      messagingService.cleanup();
    };
  }, [recipientId, messagingService, currentUserId]);

  // Helper functions to get peer info
  const getPeerName = (peerId: string): string => {
    return `User ${peerId.slice(0, 8)}...`;
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Get channel info
  const channelName = getPeerName(recipientId);
  const channelAvatar = '';

  return (
    <div className="flex flex-col h-full bg-[#1C1D28]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#232536]">
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={channelAvatar} />
            <AvatarFallback>{channelName[0]}</AvatarFallback>
          </Avatar>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-semibold text-white">
              {channelName}
            </h1>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-gray-700">
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-gray-700">
            <Bell className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            No messages yet
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={message.id || index} className="flex items-start space-x-3">
                <Avatar className="h-10 w-10 mt-0.5">
                  <AvatarImage src={message.sender.avatar} />
                  <AvatarFallback>{message.sender.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-white">
                      {message.sender.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatRelativeTime(message.timestamp)}
                    </span>
                    {message.pending && (
                      <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full">
                        Sending...
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-white whitespace-pre-line">
                    {message.content}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <TypingIndicator
                isTyping={true}
                peerName={channelName}
                className="bg-gray-800 bg-opacity-40 rounded-lg"
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-800 bg-[#232536]">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-gray-700" type="button">
              <Upload className="h-5 w-5" />
            </Button>
          </div>

          <RetryableMessageSender
            recipientId={recipientId}
            placeholder={`Message ${channelName}`}
            className="flex-1"
          />

          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-gray-700" type="button">
            <Shield className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-gray-700" type="button">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};