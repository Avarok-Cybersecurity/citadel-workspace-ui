import type { ReactNode } from 'react';
import { FileText, MessageSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GroupChatView from '@/components/chat/GroupChatView';
import { GroupCallControls } from '@/components/call/GroupCallControls';
import { GroupCallDock } from '@/components/call/GroupCallDock';
import { useDomainCallMembers } from '@/hooks/use-domain-call-members';

interface OfficeChatTabsProps {
  contentView: ReactNode;
  /** The chat channel of this office/room; also scopes its group call. */
  chatChannelId: string;
  /** The workspace node whose member roster a call here would ring. */
  nodeId?: string;
  roomName: string;
  currentUserId: string;
  currentUserName: string;
  rules?: string;
}

/**
 * The Content/Chat tab pair of a chat-enabled office or room, plus its calling
 * surface. Extracted from BaseOffice both for the file cap and because the
 * call must dock ABOVE the tabs: inactive tab panels unmount, and a call that
 * goes silent whenever the user glances at the Content tab reads as dropped.
 */
export function OfficeChatTabs({
  contentView,
  chatChannelId,
  nodeId,
  roomName,
  currentUserId,
  currentUserName,
  rules,
}: OfficeChatTabsProps) {
  const callMembers = useDomainCallMembers(nodeId);

  return (
    <div className="w-full h-full flex flex-col">
      <GroupCallDock roomId={chatChannelId} />
      <Tabs defaultValue="content" className="w-full flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-4 border-b border-border flex-shrink-0 flex items-center justify-between gap-2">
          <TabsList className="bg-background">
            {/* data-[state=active]:text-primary-foreground pairs with the fill above it. Without it the active tab kept the page's text colour, which is ink in light mode: 2.18:1 on the purple fill. Dark mode hid it, because there the page text is already near-white. */}
            <TabsTrigger value="content" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="h-4 w-4 mr-2" />
              Content
            </TabsTrigger>
            <TabsTrigger value="chat" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
          </TabsList>
          <GroupCallControls
            roomId={chatChannelId}
            roomName={roomName}
            members={callMembers}
          />
        </div>

        <TabsContent value="content" className="mt-0 flex-1 overflow-auto">
          {contentView}
        </TabsContent>

        <TabsContent value="chat" className="mt-0 flex-1 overflow-hidden">
          <GroupChatView
            groupId={chatChannelId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            rules={rules}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
