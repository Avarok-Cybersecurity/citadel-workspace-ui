/**
 * The focused hierarchy, mounted as the sidebar mounts it: the real TreeNodesSection over the design's
 * six-level estate, at the sidebar's own width. The selection lives in local state here instead of the
 * URL -- the input, not the component, is what a scenario fakes.
 *
 * `?sel=<id>` picks the starting selection; `?anim=off` is the user's Animations switch turned off.
 */
import { useState } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TreeNodesSection } from '@/components/layout/sidebar/TreeNodesSection';
import { setTreeSchema } from '@/lib/entity-type-registry';
import { applyAppearanceSettings, defaultAppearanceSettings } from '@/lib/appearance-settings';

const config = (type, label, plural, icon) => ({ type_name: type, icon, label, plural_label: plural, name_placeholder: '', description_placeholder: '' });
const SCHEMA = {
  entity_type_configs: [
    config('Workspace', 'Workspace', 'Workspaces', 'building-2'), config('City', 'City', 'Cities', 'layers'),
    config('Building', 'Building', 'Buildings', 'building-2'), config('Floor', 'Floor', 'Floors', 'folder-kanban'),
    config('Office', 'Office', 'Offices', 'briefcase'), config('Room', 'Room', 'Rooms', 'message-square'),
  ],
};

const CHILD = { City: ['Building'], Building: ['Floor'], Floor: ['Office'], Office: ['Room'], Room: ['Room'] };
const node = (id, parent, type, name, extra) => ({
  id, parent_id: parent, entity_type: { Child: type }, depth: 0, name, description: '', owner_id: '', members: [], children: [],
  mdx_content: '', mdx_content_hash: null, rules: null, chat_enabled: false, chat_channel_id: null, default_permissions: {},
  metadata: [], allowed_child_types: CHILD[type], is_default: false, created_at: 0n, updated_at: 0n, ...extra,
});

const ESTATE = [
  node('berlin', 'workspace-root', 'City', 'Berlin'), node('munich', 'workspace-root', 'City', 'Munich'), node('remote', 'workspace-root', 'City', 'Remote'),
  node('alex', 'berlin', 'Building', 'Alexanderplatz 1'), node('potsdamer', 'berlin', 'Building', 'Potsdamer Platz'),
  node('marien', 'munich', 'Building', 'Marienplatz 5'),
  node('floor3', 'alex', 'Floor', 'Floor 3'), node('floor4', 'alex', 'Floor', 'Floor 4'), node('pfloor1', 'potsdamer', 'Floor', 'Floor 1'),
  node('mfloor1', 'marien', 'Floor', 'Floor 1'),
  node('eng', 'floor3', 'Office', 'Engineering'), node('design', 'floor3', 'Office', 'Design'),
  node('flex', 'eng', 'Room', 'Flex HQ (Hot-desk)'), node('standup', 'eng', 'Room', 'Standup', { is_default: true }),
  node('subflex', 'flex', 'Room', 'Sub-Flex'), node('subflex2', 'flex', 'Room', 'Sub-Flex 2'),
  node('crit', 'design', 'Room', 'Crit Room'), node('quiet', 'design', 'Room', 'Quiet Room'), node('research', 'design', 'Room', 'Research'),
];

const NOTHING = () => {};

/**
 * The schema and the Animations switch are global, and every scenario shares
 * this module graph: set at import, they would reach the other scenarios too
 * (the root font size alone rescales every rem-based gap). Set once, here,
 * before this scenario's first render.
 */
function prepare() {
  const params = new URLSearchParams(location.search);
  setTreeSchema(SCHEMA);
  applyAppearanceSettings({ ...defaultAppearanceSettings, animationsEnabled: params.get('anim') !== 'off' });
  return params.get('sel') ?? undefined;
}

function FocusedSidebar() {
  const [selected, setSelected] = useState(prepare);
  return (
    <SidebarProvider>
      <TooltipProvider delayDuration={0}>
        <div className="bg-sidebar" style={{ width: 'var(--appearance-sidebar-width)', minHeight: '100vh', paddingTop: 8 }}>
          <TreeNodesSection
            workspaceName="Lexelnet"
            nodes={ESTATE}
            selectedNodeId={selected}
            onNodeSelect={setSelected}
            onNodeEdit={NOTHING}
            onNodeDelete={NOTHING}
            onNodeCreate={NOTHING}
            onAdminSettings={NOTHING}
            onSetDefault={NOTHING}
            onMoveNode={NOTHING}
            createBlockedReason={null}
          />
        </div>
      </TooltipProvider>
    </SidebarProvider>
  );
}

export const SIDEBAR_SCENARIOS = { 'focused-sidebar': FocusedSidebar };
