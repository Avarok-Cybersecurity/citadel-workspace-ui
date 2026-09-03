import { describe, it, expect, vi, afterEach  } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TreeNodeItem } from '../TreeNodeItem';
import type { DomainNode, TreeNode } from '../tree-node-types';
import { SidebarProvider, SidebarMenu } from '@/components/ui/sidebar';

/**
 * The expand toggle used to be a <span role="button" tabIndex={0}> INSIDE the row
 * button. A comment there showed someone had silenced React's
 * validateDOMNesting warning that way without fixing what it was pointing at: a
 * focusable, role="button" descendant of a button is still nested interactive
 * content, and which one the keyboard reaches is up to the browser.
 *
 * These assert the structure rather than the styling, because the structure is
 * what was wrong.
 */
function node(id: string, name: string): DomainNode {
  return {
    id,
    parent_id: 'workspace-root',
    name,
    entity_type: { Child: 'Office' },
    depth: 1,
    description: '',
    owner_id: '',
    members: [],
    children: [],
    mdx_content: '',
    rules: null,
    chat_enabled: false,
    chat_channel_id: null,
    default_permissions: [],
    metadata: [],
    allowed_child_types: [],
  } as unknown as DomainNode;
}

const withChild: TreeNode = {
  node: node('office-1', 'Engineering'),
  children: [{ node: node('room-1', 'Frontend'), children: [] }],
};

function renderNode(expanded: string[] = []): { onToggleExpand: ReturnType<typeof vi.fn>; onNodeSelect: ReturnType<typeof vi.fn>; } {
  const onToggleExpand: ReturnType<typeof vi.fn> = vi.fn();
  const onNodeSelect: ReturnType<typeof vi.fn> = vi.fn();
  // The real provider and list wrapper, not stand-ins: SidebarMenuButton reads
  // context from one and SidebarMenuItem is an <li> that belongs in the other.
  // Substituting either would test a different component than the one that ships.
  render(
    <SidebarProvider>
      <SidebarMenu>
        <TreeNodeItem
          treeNode={withChild}
          depth={0}
          expandedNodes={new Set(expanded)}
          onToggleExpand={onToggleExpand}
          onNodeSelect={onNodeSelect}
        />
      </SidebarMenu>
    </SidebarProvider>
  );
  return { onToggleExpand, onNodeSelect };
}

afterEach(cleanup);

describe('TreeNodeItem', () => {
  it('renders the expand toggle as a real button', () => {
    renderNode();

    const toggle: HTMLElement = screen.getByTestId('tree-node-toggle-office-1');
    expect(toggle.tagName).toBe('BUTTON');
  });

  it('keeps the toggle outside the row button', () => {
    renderNode();

    const row: HTMLElement = screen.getByTestId('tree-node-office-1');
    const toggle: HTMLElement = screen.getByTestId('tree-node-toggle-office-1');

    // The regression: a focusable control inside another control.
    expect(row.contains(toggle)).toBe(false);
  });

  it('reports its expanded state, and reports it changing', () => {
    cleanup();
    renderNode([]);
    expect(screen.getByTestId('tree-node-toggle-office-1')).toHaveAttribute('aria-expanded', 'false');

    cleanup();
    renderNode(['office-1']);
    expect(screen.getByTestId('tree-node-toggle-office-1')).toHaveAttribute('aria-expanded', 'true');
  });

  it('names the toggle and the actions menu for screen readers', () => {
    renderNode();

    // Both were icon-only and announced as "button".
    expect(screen.getByRole('button', { name: 'Expand Engineering' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Engineering' })).toBeInTheDocument();
  });

  it('toggles without selecting the node', () => {
    const { onToggleExpand, onNodeSelect } = renderNode();

    screen.getByTestId('tree-node-toggle-office-1').click();

    expect(onToggleExpand).toHaveBeenCalledWith('office-1');
    expect(onNodeSelect).not.toHaveBeenCalled();
  });
});
