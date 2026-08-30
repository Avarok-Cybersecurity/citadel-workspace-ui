import { useState, type ReactNode } from 'react';
import { FileText, MessageSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GroupChatView from '@/components/chat/GroupChatView';
import { GroupCallControls , type GroupCallMember } from '@/components/call/GroupCallControls';
import { usePermission } from '@/hooks/use-permission';
import type { GroupRestriction } from '@/components/chat/group-restriction';
import { Permission } from '@/lib/permissions-service/types';
import { GroupCallDock } from '@/components/call/GroupCallDock';
import { useDomainCallMembers } from '@/hooks/use-domain-call-members';
import { rememberedTab, rememberTab, type OfficeTab } from './office-tab-memory';

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
}: OfficeChatTabsProps): JSX.Element {
  const callMembers: GroupCallMember[] = useDomainCallMembers(nodeId);
  const [tab, setTab] = useState<OfficeTab>((): OfficeTab => rememberedTab(chatChannelId));
  // Office chat is governed by the workspace permission system, not by group
  // roles, so its only two answers are the permission's.
  const send: ReturnType<typeof usePermission> = usePermission(nodeId, Permission.SendMessages);

  // Three things that are NOT the answer "no", and reading any of them as a
  // denial takes the composer away and blames the reader's permissions:
  //
  //   - `loading`: nobody has answered yet;
  //   - `unanswered`: the retry budget ran out, which is a failed request;
  //   - `!answered`: no answer for this domain has been stored. `hasPermission`
  //     returns false for a cache MISS, which is indistinguishable here from a
  //     real denial, and covers both "there is no domain to ask about" and "we
  //     have never been told about this one". BaseOffice spells the same
  //     convention two files away as `!domainId || canEditMdx`, and this line
  //     was written without it -- so every user in a three-user office run was
  //     told "You do not have permission to send messages here."
  const sendRestriction: GroupRestriction =
    send.allowed || send.loading || send.unanswered || !send.answered
      ? 'allowed'
      : 'denied-by-role';

  return (
    <div className="w-full h-full flex flex-col">
      <GroupCallDock roomId={chatChannelId} />
      <Tabs
        // Controlled, and seeded from what this room was last left on.
        // `defaultValue` put the selection in the component instance, and
        // BaseOffice is keyed on the node id so that it remounts -- which threw
        // a reader back to Content mid-conversation with no action of theirs.
        value={tab}
        onValueChange={(next): void => {
          const chosen: OfficeTab = next === 'chat' ? 'chat' : 'content';
          setTab(chosen);
          rememberTab(chatChannelId, chosen);
        }}
        className="w-full flex-1 min-h-0 flex flex-col"
      >
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
            sendRestriction={sendRestriction}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
