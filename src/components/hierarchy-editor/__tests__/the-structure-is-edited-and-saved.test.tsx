/**
 * The Structure view stages edits, refuses the ones the server would, and saves them at once.
 *
 * Driven through the level list and the side panel: the same edits the graph's drags make, and
 * the ones the keyboard and small screens use.
 *
 * Spied: WorkspaceService.updateTreeSchema, the server round-trip (the kernel side is covered by
 * a_hierarchy_change_is_checked_against_the_tree.rs). The view, its panel, the edit rules and the
 * workspace context are production code.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkspaceContext } from '@/contexts/WorkspaceContext';
import type { DomainNode, TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import WorkspaceService from '@/lib/workspace-service';
import { StructureView } from '../StructureView';

const cfg = (type_name: string): TreeSchema['entity_type_configs'][number] => ({
  type_name, icon: 'folder', label: type_name, plural_label: `${type_name}s`, name_placeholder: '', description_placeholder: '', chat_default: true,
});
const SAVED: TreeSchema = {
  id: 'default', name: 'Default Schema', max_depth: 2,
  rules: [{ parent_type: 'Workspace', allowed_child_types: ['Office'] }, { parent_type: 'Office', allowed_child_types: ['Room'] }, { parent_type: 'Room', allowed_child_types: [] }],
  entity_type_configs: [cfg('Workspace'), cfg('Office'), cfg('Room')],
};
type ContextValue = React.ContextType<typeof WorkspaceContext>;
const ROOM: DomainNode = { id: 'r1', parent_id: 'o1', entity_type: { Child: 'Room' }, name: 'Standup' } as unknown as DomainNode;

function renderView(): void {
  const value: ContextValue = { state: { nodes: { r1: ROOM }, treeSchema: SAVED } } as unknown as ContextValue;
  render(<WorkspaceContext.Provider value={value}><StructureView saved={SAVED} /></WorkspaceContext.Provider>);
}

// The list layout (below 768 px): what the graph's drags do, without a pointer.
let width: number;
beforeEach(() => { width = window.innerWidth; Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 }); });
afterEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }); vi.restoreAllMocks(); });

describe('the Structure view', () => {
  it('adds a level, nests it, and saves the whole hierarchy in one request', async () => {
    const save = vi.spyOn(WorkspaceService, 'updateTreeSchema').mockResolvedValue(undefined);
    renderView();
    expect((screen.getByTestId('save-hierarchy') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('new-level-name'), { target: { value: 'Desk' } });
    fireEvent.click(screen.getByTestId('add-level'));
    // Not placed yet: the save is held, and says why.
    expect(screen.getByTestId('hierarchy-problem').textContent).toContain('Connect Desk');

    fireEvent.click(screen.getByTestId('level-list-Room'));
    fireEvent.click(screen.getByTestId('contains-Desk'));
    fireEvent.click(screen.getByTestId('save-hierarchy'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const sent: TreeSchema = save.mock.calls[0][0];
    expect(sent.rules.find((r) => r.parent_type === 'Room')?.allowed_child_types).toEqual(['Desk']);
    expect(sent.entity_type_configs.map((c) => c.type_name)).toContain('Desk');
  });

  it('refuses a loop as it is made, and saves nothing', () => {
    const save = vi.spyOn(WorkspaceService, 'updateTreeSchema').mockResolvedValue(undefined);
    renderView();
    fireEvent.click(screen.getByTestId('level-list-Room'));
    fireEvent.click(screen.getByTestId('contains-Office'));
    expect(screen.getByRole('alert').textContent).toContain('inside itself');
    expect((screen.getByTestId('save-hierarchy') as HTMLButtonElement).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('will not remove a level that rooms still use, and says how many', () => {
    renderView();
    fireEvent.click(screen.getByTestId('level-list-Room'));
    expect((screen.getByTestId('level-remove') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('level-panel').textContent).toContain('1 item uses this level');
  });

  it("shows the server's reason when it refuses the save", async () => {
    vi.spyOn(WorkspaceService, 'updateTreeSchema').mockRejectedValue(new Error('This hierarchy would leave 1 item where it no longer allows them: "Standup".'));
    renderView();
    fireEvent.click(screen.getByTestId('level-list-Office'));
    fireEvent.change(screen.getByTestId('level-label'), { target: { value: 'Department' } });
    fireEvent.click(screen.getByTestId('save-hierarchy'));
    expect((await screen.findByRole('alert')).textContent).toContain('"Standup"');
  });

  it('draws every level as a node of the graph on a wide screen', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    renderView();
    for (const level of ['Workspace', 'Office', 'Room']) expect(screen.getByTestId(`level-node-${level}`)).toBeTruthy();
    // The Workspace takes nothing above it: no incoming handle.
    expect(screen.getByTestId('level-node-Workspace').querySelector('.react-flow__handle-top')).toBeNull();
  });
});

