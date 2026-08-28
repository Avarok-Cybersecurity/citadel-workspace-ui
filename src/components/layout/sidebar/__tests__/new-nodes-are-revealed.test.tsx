/**
 * A node you just created has to be visible.
 *
 * The tree expands its first level ONCE, when it first arrives. Anything
 * created afterwards inside a collapsed node — or inside an office created
 * after that moment — landed somewhere invisible. The write succeeded and a
 * success toast appeared, so it read as a broken write rather than a hidden one:
 *
 *   Filling node modal: TestRoom_1787941501537
 *   ✓ Success toast visible (1 toast(s))
 *   Room created: false
 *
 * Rendered rather than reasoned about. The first version of this test
 * reimplemented the rule and asserted its own copy, which is the "declaration
 * nobody compared to an implementation" shape recorded elsewhere in this file —
 * deleting the effect from the component left it green.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TreeNodesSection } from '../TreeNodesSection';
import { eventEmitter } from '@/lib/event-emitter';
import type { DomainNode, TreeNode } from '../tree-node-types';

afterEach(cleanup);

function node(id: string, name: string, parent: string | null, children: string[] = []): DomainNode {
  return {
    id,
    parent_id: parent,
    entity_type: parent === null ? 'Workspace' : { Child: 'Office' },
    depth: parent === null ? 0 : 1,
    name,
    description: '',
    owner_id: 'someone',
    members: [],
    children,
    mdx_content: '',
    mdx_content_hash: null,
    rules: null,
    chat_enabled: false,
    chat_channel_id: null,
    default_permissions: {} as DomainNode['default_permissions'],
    metadata: [],
    allowed_child_types: null,
    is_default: false,
    created_at: 0n,
    updated_at: 0n,
  };
}

/** A workspace with one office, and the office holding one room. */
const ROOT: DomainNode = node('root', 'Workspace', null, ['office']);
const OFFICE: DomainNode = node('office', 'Design', 'root', ['room']);
const ROOM: DomainNode = node('room', 'Standup', 'office');

function treeFor(withRoom: boolean): TreeNode {
  return {
    node: ROOT,
    children: [
      {
        node: withRoom ? OFFICE : { ...OFFICE, children: [] },
        children: withRoom ? [{ node: ROOM, children: [] }] : [],
      },
    ],
  };
}

describe('a node that has just arrived', () => {
  it('opens the parent it was created in', async () => {
    // The office starts EMPTY, which is the case that matters: auto-expand
    // opens the first level and any child that already has children, so a node
    // created inside a childless office is the one that lands out of sight.
    const view: ReturnType<typeof render> = render(
      <MemoryRouter>
        <SidebarProvider>
          <TreeNodesSection tree={treeFor(false)} nodes={[ROOT, OFFICE]} canCreate />
        </SidebarProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Standup')).toBeNull();

    // The room arrives: the tree now holds it, and the event says who created
    // it. Both happen for a real creation.
    view.rerender(
      <MemoryRouter>
        <SidebarProvider>
          <TreeNodesSection tree={treeFor(true)} nodes={[ROOT, OFFICE, ROOM]} canCreate />
        </SidebarProvider>
      </MemoryRouter>,
    );
    await act(async () => {
      eventEmitter.emit('node:loaded', { node: ROOM, connection: {} });
    });

    expect(screen.getByText('Standup')).toBeInTheDocument();
  });
});
