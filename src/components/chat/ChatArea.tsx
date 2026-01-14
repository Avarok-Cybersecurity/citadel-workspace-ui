import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Bell, Search, Shield, Send, MoreVertical, Upload, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
// Removed messageChannels import - now handled internally
import { FormEvent, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { formatRelativeTime } from "../../lib/date-utils";
import { RetryableMessageSender } from "./RetryableMessageSender";
import { TypingIndicator } from "./TypingIndicator";
import { MessagingService, Message as MessageType } from "../../lib/messaging-service";

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

// Sample user data (in a real app, this would come from authentication or user service)
const CURRENT_USER = {
  id: "current-user",
  name: "You",
  avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6"
};

export const ChatArea = ({ recipientId }: ChatAreaProps) => {
  const { state } = useWorkspace();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagingService = MessagingService.getInstance();
  
  // Initialize with any existing messages from the current conversation
  useEffect(() => {
    // In a real implementation, we would fetch conversation history
    // For now, we're starting with an empty conversation
    setMessages([]);
    
    // Set up handlers for new messages and typing indicators
    const handleNewMessage = (message: MessageType) => {
      if (message.recipientId === CURRENT_USER.id && message.senderId === recipientId) {
        // Message is from the current chat partner to us
        const newMessage: Message = {
          id: message.id,
          content: message.content,
          timestamp: message.timestamp,
          sender: {
            id: message.senderId,
            name: getPeerName(message.senderId),
            avatar: getPeerAvatar(message.senderId)
          }
        };
        setMessages(prev => [...prev, newMessage]);
      } else if (message.senderId === CURRENT_USER.id && message.recipientId === recipientId) {
        // Our message sent to the current chat partner (status updates)
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
    
    // Register handlers with the messaging service
    messagingService.setMessageReceivedHandler(handleNewMessage);
    messagingService.setTypingStatusHandler(handleTypingStatus);
    
    // For demo purposes, simulate receiving a welcome message
    setTimeout(() => {
      messagingService.simulateMessageReceived(recipientId, "Hello! This is a simulated conversation. Type a message below to see how it works.");
    }, 1000);
    
    // Clean up event handlers when component unmounts or recipient changes
    return () => {
      messagingService.cleanup();
    };
  }, [recipientId, messagingService]);

  // Helper functions to get peer info
  const getPeerName = (peerId: string): string => {
    // In a real implementation, this would come from a user service or workspace state
    if (peerId === "demo-peer-kathy") return "Kathy McCooper";
    return `User ${peerId.slice(0, 8)}...`;
  };
  
  const getPeerAvatar = (peerId: string): string => {
    // In a real implementation, this would come from a user service or workspace state
    if (peerId === "demo-peer-kathy") return "https://images.unsplash.com/photo-1649972904349-6e44c42644a7";
    return "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61";
  };
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);
  
  // Get channel info
  const channelName = getPeerName(recipientId);
  const channelAvatar = getPeerAvatar(recipientId);

  return (
    <div className="flex flex-col h-full bg-[#444A6C]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#343A5C]">
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
      <div className="p-4 border-t border-gray-800 bg-[#343A5C]">
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