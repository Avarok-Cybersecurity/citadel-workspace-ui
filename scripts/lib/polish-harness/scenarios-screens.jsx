/**
 * The main screens, assembled from the real components with typed-in input. For the UX Oracle's captures
 * and for the geometry walker; nothing here replaces a component.
 */
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider } from '@/components/ui/sidebar';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { ConfirmDialogProvider } from '@/components/shared/confirm-dialog';
import { Toaster } from '@/components/ui/sonner';
import { GroupMessageItem } from '@/components/chat/GroupMessageItem';
import { GroupChatHeader } from '@/components/chat/GroupChatHeader';
import { SettingsModal } from '@/components/SettingsModal';
import { OfficeLayout } from '@/components/office/OfficeLayout';
import { WORKSPACE_ROOT_ID } from '@/lib/workspace-constants';
import Landing from '@/pages/Landing';
import { ADA } from './scenarios-people.jsx';

const NOTHING = () => {};
const STATE = {
  members: { ada: ADA, grace: { id: 'grace', username: 'grace', displayName: 'Grace Hopper', role: 'admin', isOnline: true } },
  currentUser: { id: 'me', username: 'me', name: 'Me' },
  nodes: {}, treeSchema: null, loading: { workspace: false, members: false, nodes: false },
};

export function Shell({ children, route = '/', state = STATE }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <WorkspaceProvider state={state}>
        <PermissionsProvider>
          <ConfirmDialogProvider>
            <TooltipProvider>
              <SidebarProvider>
                <Toaster />
                {children}
              </SidebarProvider>
            </TooltipProvider>
          </ConfirmDialogProvider>
        </PermissionsProvider>
      </WorkspaceProvider>
    </MemoryRouter>
  );
}

const at = (minutes) => new Date().setHours(10, minutes, 0, 0);
const GROUP_MESSAGES = [
  { id: 'g1', group_id: 'grp', sender_id: 'ada', sender_name: 'Ada Lovelace', content: 'Morning all. The analytical engine notes are in the shared folder.', timestamp: at(0), read_by: [] },
  { id: 'g2', group_id: 'grp', sender_id: 'grace', sender_name: 'Grace Hopper', content: 'Thanks Ada. I will compile them before lunch, there is a very long identifier in section four: a-very-long-unbroken-token-that-must-wrap-inside-the-bubble-and-not-push-the-layout.', timestamp: at(2), read_by: [] },
  { id: 'g3', group_id: 'grp', sender_id: 'me', sender_name: 'Me', content: 'Sounds good. I will review after.', timestamp: at(5), read_by: [{ user_id: 'ada', user_name: 'Ada Lovelace', read_at: at(6) }] },
  { id: 'g4', group_id: 'grp', sender_id: 'me', sender_name: 'Me', content: 'One more thing: can someone check the build?', timestamp: at(6), read_by: [] },
];

function GroupChat() {
  return (
    <Shell>
      <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }} className="bg-background">
        {GROUP_MESSAGES.map((message) => (
          <GroupMessageItem
            key={message.id} message={message} currentUserName="me" totalMembers={3} onEdit={NOTHING} onDelete={NOTHING}
            canRevise onReply={NOTHING} focusComposer={NOTHING} quoted={null}
          />
        ))}
      </div>
    </Shell>
  );
}

const treeNode = (id, parent, type, name) => ({
  id, parent_id: parent, entity_type: { Child: type }, depth: 0, name, description: '', owner_id: '', members: [], children: [],
  mdx_content: '', mdx_content_hash: null, rules: null, chat_enabled: false, chat_channel_id: null, default_permissions: {},
  metadata: [], allowed_child_types: [], is_default: false, created_at: 0n, updated_at: 0n,
});
/** Four levels deep, with names as long as people give them, so the header has to fold and truncate. */
const DEEP = {
  ...STATE,
  workspace: { id: 'w', name: 'LexelNet Research and Development' },
  nodes: Object.fromEntries([
    treeNode('hq', WORKSPACE_ROOT_ID, 'Office', 'Headquarters and Engineering Operations'),
    treeNode('floor', 'hq', 'Floor', 'Third floor, east wing'),
    treeNode('standup', 'floor', 'Room', 'Daily standup and planning for the platform team'),
  ].map((n) => [n.id, n])),
};

function OfficeHeader() {
  return (
    <Shell route="/workspace?nodeId=standup" state={DEEP}>
      <OfficeLayout title={DEEP.nodes.standup.name} nodeId="standup" isEditing={false} onEditToggle={NOTHING} canEdit>
        <p style={{ padding: 16 }}>The page under the header.</p>
      </OfficeLayout>
    </Shell>
  );
}

const settingsTab = (tab) => () => <Shell><SettingsModal open onOpenChange={NOTHING} tab={tab} /></Shell>;
const SignIn = () => <Shell><Landing /></Shell>;

export const SCREEN_SCENARIOS = { 'group-chat': GroupChat, settings: settingsTab('general'), 'settings-connections': settingsTab('connections'), 'settings-appearance': settingsTab('appearance'), 'settings-privacy': settingsTab('privacy'), landing: SignIn, 'office-header': OfficeHeader };
