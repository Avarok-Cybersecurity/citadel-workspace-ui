import { MessageSquare, MessageCircle, Search, Circle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useLocation, useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { P2PMessengerManager } from "@/lib/p2p-messenger-manager";
import { Badge } from "@/components/ui/badge";

// Initial demo channels - these will be replaced by actual P2P conversations
const initialChannels = [
  {
    id: "demo-peer-kathy",
    name: "Kathy McCooper",
    avatar: "https://images.unsplash.com/photo-1649972904349-6e44c42644a7",
    isP2P: true,
    unreadCount: 0,
    lastMessage: "Hey! How's the project going?",
    lastMessageTime: Date.now() - 1000 * 60 * 5,
    isOnline: true,
    isTyping: false
  }
];

interface MessageChannel {
  id: string;
  name: string;
  avatar?: string;
  isP2P: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: number;
  isOnline?: boolean;
  isTyping?: boolean;
}

export const MessagesSection = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [channels, setChannels] = useState<MessageChannel[]>(initialChannels);
  const [showSearch, setShowSearch] = useState(false);
  
  const messenger = P2PMessengerManager.getInstance();
  const params = new URLSearchParams(location.search);
  const currentChannel = params.get("channel");
  const selectedPeerCid = params.get("p2pUser");

  // Load P2P conversations
  useEffect(() => {
    const loadConversations = () => {
      const conversations = messenger.getAllConversations();
      const p2pChannels = conversations.map(conv => {
        const lastMessage = conv.messages[conv.messages.length - 1];
        return {
          id: conv.peerCid,
          name: `User ${conv.peerCid.slice(0, 8)}...`,
          isP2P: true,
          unreadCount: conv.unreadCount,
          lastMessage: lastMessage?.content,
          lastMessageTime: lastMessage?.timestamp,
          isOnline: messenger.isConnected(conv.peerCid),
          isTyping: false
        };
      });
      
      // Merge with demo channels
      const allChannels = [...initialChannels, ...p2pChannels];
      setChannels(allChannels);
    };

    loadConversations();

    // Subscribe to updates
    const unsubscribe = messenger.onMessage(() => {
      loadConversations();
    });

    const unsubscribeConnection = messenger.onConnectionChange(() => {
      loadConversations();
    });

    return () => {
      unsubscribe();
      unsubscribeConnection();
    };
  }, []);

  const handleMessageClick = (channel: MessageChannel) => {
    const params = new URLSearchParams(location.search);
    params.set("showP2P", "true");
    params.set("p2pUser", channel.name);
    params.set("channel", channel.id);
    navigate(`${location.pathname}?${params.toString()}`);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    
    // If user presses enter and query looks like a CID, add it as a new conversation
    if (query && query.length > 10) {
      // This is a simplified check - in production, validate CID format
      const newChannel: MessageChannel = {
        id: query,
        name: `User ${query.slice(0, 8)}...`,
        isP2P: true,
        unreadCount: 0,
        isOnline: false,
        isTyping: false
      };
      
      // Check if channel already exists
      if (!channels.find(ch => ch.id === query)) {
        setChannels([...channels, newChannel]);
        handleMessageClick(newChannel);
        setSearchQuery("");
        setShowSearch(false);
      }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      handleSearch(searchQuery);
    }
  };

  return (
    <SidebarGroup className="flex-shrink-0 min-h-[4rem] mb-4">
      <SidebarGroupLabel className="text-[#9b87f5] font-semibold flex items-center justify-between">
        <span>MESSAGES</span>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="p-1 hover:bg-[#262C4A]/50 rounded transition-colors"
        >
          <Search className="h-3 w-3 text-[#9b87f5]" />
        </button>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {showSearch && (
          <div className="px-3 pb-2">
            <Input
              type="text"
              placeholder="Search or start new chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="h-8 bg-[#262C4A] border-[#3a3f5c] text-white placeholder-gray-400 text-sm"
            />
          </div>
        )}
        <ScrollArea className="max-h-[30vh]">
          <SidebarMenu>
            {channels.map((channel) => (
              <SidebarMenuItem 
                key={channel.id}
                className="transform transition-transform duration-200 ease-in-out"
              >
                <SidebarMenuButton
                  className="text-white hover:bg-[#E5DEFF] hover:text-[#343A5C] transition-all duration-300 ease-in-out will-change-transform relative py-2"
                  isActive={currentChannel === channel.id}
                  onClick={() => handleMessageClick(channel)}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage 
                          src={channel.avatar} 
                          loading="eager"
                        />
                        <AvatarFallback className="bg-[#6E59A5] text-xs">
                          {channel.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      {channel.isOnline && (
                        <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-green-500 text-green-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium truncate">{channel.name}</span>
                        {channel.unreadCount > 0 && (
                          <Badge className="ml-2 h-5 px-1.5 text-xs bg-[#6E59A5]">
                            {channel.unreadCount}
                          </Badge>
                        )}
                      </div>
                      {channel.isTyping ? (
                        <div className="text-xs text-[#9b87f5] italic">typing...</div>
                      ) : channel.lastMessage ? (
                        <div className="text-xs text-gray-400 truncate">{channel.lastMessage}</div>
                      ) : null}
                    </div>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </ScrollArea>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};