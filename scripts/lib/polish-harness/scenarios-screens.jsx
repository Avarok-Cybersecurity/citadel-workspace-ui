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
import { VFSToolbar } from '@/components/file-manager/VFSToolbar';
import { VFSPathBar } from '@/components/file-manager/VFSPathBar';
import { VFSContentGrid } from '@/components/file-manager/VFSContentGrid';
import { SettingsModal } from '@/components/SettingsModal';
import Landing from '@/pages/Landing';
import { ADA } from './scenarios-people.jsx';

const NOTHING = () => {};
const STATE = {
  members: { ada: ADA, grace: { id: 'grace', username: 'grace', displayName: 'Grace Hopper', role: 'admin', isOnline: true } },
  currentUser: { id: 'me', username: 'me', name: 'Me' },
  nodes: {}, treeSchema: null, loading: { workspace: false, members: false, nodes: false },
};

function Shell({ children, route = '/' }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <WorkspaceProvider state={STATE}>
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

const TREE = {
  name: '', type: 'directory', path: '/', createdAt: 1, updatedAt: 1,
  children: [
    { name: 'Designs', type: 'directory', path: '/Designs', createdAt: 1, updatedAt: 1, children: [] },
    { name: 'Notes', type: 'directory', path: '/Notes', createdAt: 1, updatedAt: 1, children: [] },
    { name: 'analytical-engine-notes-final-v3.pdf', type: 'file', path: '/analytical-engine-notes-final-v3.pdf', createdAt: 1, updatedAt: 2, fileState: 'Received', fileMetadata: { fileSize: 2_400_000, fileType: 'application/pdf', fileName: 'notes.pdf' } },
    { name: 'budget.xlsx', type: 'file', path: '/budget.xlsx', createdAt: 1, updatedAt: 2, fileState: 'Sent', fileMetadata: { fileSize: 48_000, fileType: 'application/xlsx', fileName: 'budget.xlsx' } },
  ],
};

function FileManager() {
  return (
    <Shell>
      <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }} className="bg-background">
        <VFSToolbar currentPath="/" onNavigate={NOTHING} onNewFolder={NOTHING} onUploadFile={NOTHING} uploadDisabledReason={null} onSync={NOTHING} />
        <VFSPathBar currentPath="/" onNavigate={NOTHING} tree={TREE} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <VFSContentGrid
            tree={TREE} currentPath="/" onNavigate={NOTHING} onNewFolder={NOTHING} onDelete={NOTHING} onDownload={NOTHING}
            onUploadFile={NOTHING} onInfo={NOTHING} onRename={async () => {}} onCut={NOTHING} onCopy={NOTHING} onPaste={async () => {}}
            onDrop={NOTHING} pendingPaths={new Set()} peerLabel="Ada"
          />
        </div>
      </div>
    </Shell>
  );
}

const settingsTab = (tab) => () => <Shell><SettingsModal open onOpenChange={NOTHING} tab={tab} /></Shell>;
const SignIn = () => <Shell><Landing /></Shell>;

export const SCREEN_SCENARIOS = { 'group-chat': GroupChat, 'file-manager': FileManager, settings: settingsTab('general'), 'settings-connections': settingsTab('connections'), 'settings-appearance': settingsTab('appearance'), 'settings-privacy': settingsTab('privacy'), landing: SignIn };
