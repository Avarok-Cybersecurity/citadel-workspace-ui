import type { ReactNode } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import GroupChatView from '@/components/chat/GroupChatView';
import { GroupCallControls } from '@/components/call/GroupCallControls';
import type { RoomCallRoster } from '@/lib/call/callable-members';
import { usePermission } from '@/hooks/use-permission';
import { permits } from '@/hooks/use-permission-result';
import { debugLog } from '@/lib/debug-config';
import type { GroupRestriction } from '@/components/chat/group-restriction';
import { Permission } from '@/lib/permissions-service/types';
import { GroupCallDock } from '@/components/call/GroupCallDock';
import { useDomainCallMembers } from '@/hooks/use-domain-call-members';
import { appIdsOf, type NodeTab, type NodeTabKey } from '@/lib/node-tabs/tab-list';
import type { NodeTabsModel } from './use-node-tabs';
import { useAppTabNames, type AppTabName } from './use-app-tab-names';
import { TabRow } from './TabRow';
import { TabMenu } from './TabMenu';
import { TabNotices } from './TabNotices';

interface NodeTabsProps {
  model: NodeTabsModel;
  contentView: ReactNode;
  /** The node's chat channel, which also scopes its group call; null when chat is off. */
  chatChannelId: string | null;
  /** The workspace node whose member roster a call here would ring. */
  nodeId: string;
  roomName: string;
  currentUserId: string;
  currentUserName: string;
  rules?: string;
  /** What an app tab's panel shows (app-zone/AppTabPane.tsx). */
  appPanel: (appId: string, name: AppTabName) => ReactNode;
  /** Opens the marketplace to add a tab; null when this person may not add one. */
  onAdd: (() => void) | null;
}

/**
 * A node's pane as tabs: its page, its chat when chat is on, and its app tabs, plus the calling
 * surface. The call docks ABOVE the tabs: inactive tab panels unmount, and a call that goes silent
 * whenever the user glances at another tab reads as dropped.
 */
export function NodeTabs({
  model,
  contentView,
  chatChannelId,
  nodeId,
  roomName,
  currentUserId,
  currentUserName,
  rules,
  appPanel,
  onAdd,
}: NodeTabsProps): JSX.Element {
  const callRoster: RoomCallRoster = useDomainCallMembers(nodeId);
  const names: ReadonlyMap<string, AppTabName> = useAppTabNames(appIdsOf(model.list));
  // Office chat is governed by the workspace permission system, not by group
  // roles, so its only two answers are the permission's.
  const send: ReturnType<typeof usePermission> = usePermission(nodeId, Permission.SendMessages);

  // `permits`, not `allowed`: four states are not the answer "no", and this
  // site had three of them. See hooks/use-permission-result.ts.
  const sendRestriction: GroupRestriction = permits(send) ? 'allowed' : 'denied-by-role';

  // A refusal here removes the composer, and CI has now shown one happening to
  // a user who should have been able to send. `permits` is false only when an
  // answer arrived AND withheld the permission, so the useful thing to know is
  // what that answer said -- the role it came with, and which domain it was
  // about, since `hasPermission` falls back to the workspace root.
  //
  // Logged rather than shown: the reader is told "you do not have permission",
  // which is the truthful sentence for them; the role and the domain are for
  // whoever is reading a failing run.
  if (chatChannelId !== null && sendRestriction === 'denied-by-role') {
    // Tagged as before the tabs were generalised: the integration suite's console capture keys on it.
    debugLog(
      'OfficeChatTabs',
      'composer withheld',
      {
        nodeId,
        allowed: send.allowed,
        answered: send.answered,
        loading: send.loading,
        unanswered: send.unanswered,
      },
    );
  }

  const panel = (tab: NodeTab): ReactNode => {
    if (tab.kind === 'content') return contentView;
    if (tab.kind === 'chat') {
      return chatChannelId === null ? null : (
        <GroupChatView
          groupId={chatChannelId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          rules={rules}
          // The channel's full roster is not known here (callRoster lists only who can be called).
          totalMembers={null}
          sendRestriction={sendRestriction}
        />
      );
    }
    return appPanel(tab.appId, names.get(tab.appId) ?? { label: tab.appId, known: false });
  };

  return (
    <div className="w-full min-w-0 h-full flex flex-col">
      {chatChannelId !== null && <GroupCallDock roomId={chatChannelId} />}
      <Tabs
        // Controlled, and seeded from what this node was last left on (lib/node-tabs/tab-memory).
        // BaseOffice is keyed on the node id so that it remounts, and a selection kept in the
        // component instance threw a reader back to the page mid-conversation.
        value={model.active}
        onValueChange={(next: string): void => {
          const chosen: NodeTab | undefined = model.list.tabs.find((tab: NodeTab): boolean => tab.key === next);
          if (chosen !== undefined) model.select(chosen.key as NodeTabKey);
        }}
        className="w-full flex-1 min-h-0 flex flex-col"
      >
        <TabRow
          tabs={model.list.tabs}
          names={names}
          menu={<TabMenu model={model} names={names} />}
          onAdd={onAdd}
          trailing={chatChannelId === null ? null : (
            <div className="flex flex-shrink-0 items-center">
              <GroupCallControls
                home={{ kind: 'node', roomId: chatChannelId, nodeId }}
                roomName={roomName}
                members={callRoster.callable}
                notConnected={callRoster.notConnected}
              />
            </div>
          )}
        />
        <TabNotices model={model} />
        {model.list.tabs.map((tab: NodeTab): JSX.Element => (
          <TabsContent
            key={tab.key}
            value={tab.key}
            className={tab.kind === 'content' ? 'mt-0 flex-1 overflow-auto' : tab.kind === 'chat' ? 'mt-0 flex-1 overflow-hidden' : 'mt-0 flex-1 min-h-0 overflow-hidden flex flex-col'}
          >
            {panel(tab)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
