import { AppLayout } from "@/components/layout/AppLayout";
import { ChatArea } from "@/components/chat/ChatArea";
import { useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";

const Messages = () => {
  const location = useLocation();
  const channel = new URLSearchParams(location.search).get("channel");

  return (
    <AppLayout>
      {channel ? (
        <ChatArea recipientId={channel} />
      ) : (
        <div className="h-full flex flex-col items-center justify-center bg-[#444A6C] text-gray-400">
          <MessageCircle className="h-12 w-12 mb-4" />
          <p className="text-lg">Select a conversation to start messaging</p>
        </div>
      )}
    </AppLayout>
  );
};

export default Messages;