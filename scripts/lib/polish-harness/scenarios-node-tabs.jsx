/** A node pane's tab row at its fullest: page, chat and the most app tabs a node may have, with long names. */
import { useState } from 'react';
import { NodeTabs } from '@/components/office/tabs/NodeTabs';
import { deriveTabList } from '@/lib/node-tabs/tab-list';
import { MAX_APP_TABS } from '@/lib/node-tabs/tab-keys';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { PermissionsProvider } from '@/contexts/PermissionsContext';

const STATE = { members: {}, currentUser: { id: 'me', username: 'me', name: 'Me' }, nodes: {}, treeSchema: null, loading: { workspace: false, members: false, nodes: false } };

/** The two contexts the pane reads (who may change its tabs); nothing else is wrapped around it. */
const Shell = ({ children }) => <WorkspaceProvider state={STATE}><PermissionsProvider>{children}</PermissionsProvider></WorkspaceProvider>;

const APPS = ['net.avarok.calendar', 'com.acme.kanban', 'com.acme.roadmap-planner', 'org.example.retrospectives', 'com.acme.incident-board', 'io.example.whiteboard', 'com.acme.okr-tracker', 'net.example.standup-notes'].slice(0, MAX_APP_TABS);

function Pane({ apps, workspace }) {
  const [active, setActive] = useState('content');
  const list = deriveTabList({ chatEnabled: true, node: apps === null ? { kind: 'absent' } : { kind: 'list', appIds: apps }, workspace });
  const model = { list, active, select: setActive, canConfigure: true, canSetDefault: true, busy: false, change: async () => true };
  return (
    <Shell>
    <div style={{ height: 480 }} className="flex w-full min-w-0 flex-col border border-border">
      <NodeTabs
        model={model}
        contentView={<div data-testid="node-tabs-page" className="p-[16px]">The page</div>}
        chatChannelId={null}
        nodeId="n1"
        roomName="Platform"
        currentUserId="1"
        currentUserName="alice"
        appPanel={(appId) => <div data-testid={`node-tabs-panel-${appId}`} className="p-[16px]">{appId}</div>}
        onAdd={() => {}}
      />
    </div>
    </Shell>
  );
}

export const NODE_TAB_SCENARIOS = {
  'node-tabs-full': () => <Pane apps={APPS} workspace={{ kind: 'list', appIds: [] }} />,
  'node-tabs-no-default': () => <Pane apps={null} workspace={{ kind: 'absent' }} />,
};
