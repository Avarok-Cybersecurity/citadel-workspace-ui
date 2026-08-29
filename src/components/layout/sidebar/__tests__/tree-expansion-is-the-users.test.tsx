/**
 * A collapse the user made must survive typing in the filter, and must survive
 * anyone saving a document anywhere in the workspace.
 *
 * The auto-expand effect expanded EVERY node with children, and re-ran on every
 * change of `treeData` OR `filteredTreeData` identity. `filteredTreeData` is a
 * fresh object per keystroke and reverts to `treeData` when the box is cleared;
 * `state.nodes` is re-minted on node:loaded, nodes:loaded, node:deleted,
 * node:content-updated and node:moved. So a collapse was undone by typing one
 * character and deleting it, or by a colleague saving an MDX page.
 *
 * It also meant a large workspace opened fully expanded into an unvirtualised
 * 50vh scroll area with three tab stops per row.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { TreeNodesSection } from '../TreeNodesSection';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { TreeNode } from '../tree-node-types';

function node(id: string, name: string, children: TreeNode[] = []): TreeNode {
  return {
    node: {
      id,
      name,
      description: '',
      parent_id: null,
      entity_type: { Child: 'Office' },
      children: children.map((c) => c.node.id),
      members: [],
      is_default: false,
    },
    children,
  } as unknown as TreeNode;
}

const TREE: TreeNode = node('root', 'Workspace', [
  node('office-a', 'Engineering', [node('room-1', 'Backend'), node('room-2', 'Frontend')]),
  node('office-b', 'Design', [node('room-3', 'Research')]),
]);

function Harness(): JSX.Element {
  const [, bump] = useState(0);
  return (
    <MemoryRouter>
      <SidebarProvider>
      <button onClick={() => bump((n) => n + 1)}>unrelated update</button>
      <TreeNodesSection title="Hierarchy" tree={TREE} canCreate />
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe('tree expansion', () => {
  it('keeps a collapse through a filter round-trip and an unrelated update', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // Engineering opens by default (first level), so its rooms are visible.
    expect(await screen.findByText('Backend')).toBeInTheDocument();

    // The user collapses it.
    const toggles: HTMLElement[] = screen.getAllByRole('button', { name: /collapse|expand/i });
    await user.click(toggles[0]!);
    expect(screen.queryByText('Backend')).toBeNull();

    // Typing and clearing the filter must not reopen it.
    const filter: HTMLElement = screen.getByPlaceholderText(/^filter/i);
    await user.type(filter, 'Back');
    await user.clear(filter);
    expect(screen.queryByText('Backend'), 'the filter reopened a collapsed node').toBeNull();

    // Neither must an unrelated re-render.
    await user.click(screen.getByText('unrelated update'));
    expect(screen.queryByText('Backend'), 'an unrelated update reopened it').toBeNull();
  });

  it('opens ancestors of a match while filtering, without persisting that', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const toggles: HTMLElement[] = screen.getAllByRole('button', { name: /collapse|expand/i });
    await user.click(toggles[0]!); // collapse Engineering

    const filter: HTMLElement = screen.getByPlaceholderText(/^filter/i);
    await user.type(filter, 'Backend');

    // A match hidden inside a collapsed ancestor is not a search result.
    expect(await screen.findByText('Backend')).toBeInTheDocument();

    await user.clear(filter);

    // ...and clearing restores exactly the shape the user had.
    expect(screen.queryByText('Backend')).toBeNull();
  });
});
