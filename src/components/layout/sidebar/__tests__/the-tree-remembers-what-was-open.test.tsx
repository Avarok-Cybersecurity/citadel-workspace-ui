/**
 * A branch the user opened has to still be open after a reload.
 *
 * Auto-expand opens the root and the first level that has children, once.
 * Everything below that is a click, and nothing recorded the clicks — so a
 * refresh collapsed a deep workspace back to two levels. There is no "show me
 * this node" path in the sidebar either, so a node whose branch is shut can
 * only be reached by opening every ancestor by hand.
 *
 * CI measured the boundary in a five-level tree, after `page.reload()`:
 *
 *   [UI] Node "Alpha_…"   exists: true
 *   [UI] Node "Beta_…"    exists: true
 *   [UI] Node "Charlie_…" exists: false
 *
 * `TreeNodesSection` had an `initialExpandedIds` prop for exactly this, and no
 * production caller ever passed one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TreeNodesSection } from '../TreeNodesSection';
import { SidebarProvider } from '@/components/ui/sidebar';
import { readExpanded } from '../expansion-memory';
import type { TreeNode } from '../tree-node-types';
import type { UserEvent } from '@testing-library/user-event';

const CID: bigint = 4242n;
vi.mock('@/lib/p2p/current-cid', () => ({
  getCurrentCid: (): Promise<bigint> => Promise.resolve(CID),
}));

function node(id: string, name: string, children: TreeNode[] = []): TreeNode {
  return {
    node: {
      id, name, description: '', parent_id: null,
      entity_type: { Child: 'Office' },
      children: children.map((c) => c.node.id),
      members: [], is_default: false,
    },
    children,
  } as unknown as TreeNode;
}

// Five deep, as the CI tree is: root > alpha > beta > charlie > delta.
const TREE: TreeNode = node('root', 'Workspace', [
  node('alpha', 'Alpha', [node('beta', 'Beta', [node('charlie', 'Charlie', [node('delta', 'Delta')])])]),
]);

function Sidebar({ selectedNodeId }: { selectedNodeId?: string } = {}): JSX.Element {
  return (
    <MemoryRouter>
      <SidebarProvider>
        <TreeNodesSection
          title="Hierarchy"
          tree={TREE}
          canCreate
          selectedNodeId={selectedNodeId}
        />
      </SidebarProvider>
    </MemoryRouter>
  );
}

beforeEach((): void => { localStorage.clear(); });

describe('the tree remembers what was open', () => {
  it('shows a deep node again after a remount, without re-opening the chain', async () => {
    const user: UserEvent = userEvent.setup();
    render(<Sidebar />);

    // Auto-expand reaches Beta and stops: Charlie is the first thing the user
    // has to open for themselves.
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('tree-node-toggle-beta'));
    expect(await screen.findByText('Charlie')).toBeInTheDocument();
    await waitFor((): void => { expect(readExpanded(CID)).toContain('beta'); });

    // A reload, as far as this component is concerned.
    cleanup();
    render(<Sidebar />);

    expect(await screen.findByText('Charlie')).toBeInTheDocument();
  });

  it('starts from auto-expand when there is nothing stored', async () => {
    render(<Sidebar />);
    await waitFor((): void => { expect(screen.getByText('Beta')).toBeInTheDocument(); });
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('survives a stored value written by an older build', async () => {
    // A non-array, or entries that are not ids, must read as "no memory"
    // rather than putting something into the expansion set that compares
    // unequal to every node and can never be cleared.
    localStorage.setItem(`sidebar_expanded_nodes_${CID.toString()}`, '{"beta":true}');
    render(<Sidebar />);
    await waitFor((): void => { expect(screen.getByText('Beta')).toBeInTheDocument(); });
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });
});

describe('the tree shows where you are', () => {
  it('opens the chain above a node reached by URL', async () => {
    // A shared link, a restored last location, a reload on a deep page: the
    // node is selected and nothing opened its branch, so the sidebar
    // highlighted nothing and gave no clue where the content came from.
    render(<Sidebar selectedNodeId="delta" />);

    expect(await screen.findByText('Delta')).toBeInTheDocument();
  });

  it('does not open the selected node itself', async () => {
    // Charlie has a child. Selecting Charlie makes Charlie visible; it must not
    // also push everything below it down the list.
    render(<Sidebar selectedNodeId="charlie" />);

    expect(await screen.findByText('Charlie')).toBeInTheDocument();
    expect(screen.queryByText('Delta')).not.toBeInTheDocument();
  });
});
