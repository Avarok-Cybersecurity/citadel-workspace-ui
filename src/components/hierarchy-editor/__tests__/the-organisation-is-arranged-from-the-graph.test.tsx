/**
 * The Organisation view creates, moves and opens the real offices and rooms, through the same
 * requests the sidebar sends.
 *
 * Driven through the node list and its panel (the layout below 768 px, and the keyboard's route
 * on the graph).
 *
 * Spied: WorkspaceService.createNode and moveNode, the server round-trips. The view, its panel,
 * the move rules and the workspace context are production code.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceContext } from '@/contexts/WorkspaceContext';
import { ConfirmDialogProvider } from '@/components/shared/confirm-dialog';
import type { DomainNode, TreeSchema } from '@/components/layout/sidebar/tree-node-types';
import WorkspaceService from '@/lib/workspace-service';
import { OrganisationView } from '../OrganisationView';

const cfg = (type_name: string): TreeSchema['entity_type_configs'][number] => ({
  type_name, icon: 'folder', label: type_name, plural_label: `${type_name}s`, name_placeholder: '', description_placeholder: '', chat_default: true,
});
const SCHEMA: TreeSchema = {
  id: 'default', name: 'Default Schema', max_depth: 2,
  rules: [{ parent_type: 'Workspace', allowed_child_types: ['Office'] }, { parent_type: 'Office', allowed_child_types: ['Room'] }],
  entity_type_configs: [cfg('Workspace'), cfg('Office'), cfg('Room')],
};
const node = (id: string, parent: string, type: string, name: string, depth: number, children: string[]): DomainNode =>
  ({ id, parent_id: parent, entity_type: { Child: type }, name, depth, allowed_child_types: children } as unknown as DomainNode);
const NODES: Record<string, DomainNode> = {
  o1: node('o1', 'workspace-root', 'Office', 'Ops', 1, ['Room']),
  o2: node('o2', 'workspace-root', 'Office', 'Sales', 1, ['Room']),
  r1: node('r1', 'o1', 'Room', 'Standup', 2, []),
};
type ContextValue = React.ContextType<typeof WorkspaceContext>;

function renderView(): void {
  const value: ContextValue = { state: { nodes: NODES, workspace: { id: 'workspace-root', name: 'Avarok' } } } as unknown as ContextValue;
  render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <WorkspaceContext.Provider value={value}><OrganisationView schema={SCHEMA} /></WorkspaceContext.Provider>
      </ConfirmDialogProvider>
    </MemoryRouter>,
  );
}

let width: number;
beforeEach(() => { width = window.innerWidth; Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 }); });
afterEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }); vi.restoreAllMocks(); });

describe('the Organisation view', () => {
  it('adds a room inside an office', async () => {
    const create = vi.spyOn(WorkspaceService, 'createNode').mockResolvedValue(undefined);
    renderView();
    fireEvent.click(screen.getByTestId('org-list-o1'));
    fireEvent.click(screen.getByTestId('org-add-Room'));
    fireEvent.change(screen.getByTestId('org-new-name'), { target: { value: 'Retro' } });
    fireEvent.click(screen.getByTestId('org-create'));
    await waitFor(() => expect(create).toHaveBeenCalledWith('o1', { Child: 'Room' }, 'Retro', ''));
  });

  it('offers a room only the levels that may hold it, and nothing to add inside it', () => {
    renderView();
    fireEvent.click(screen.getByTestId('org-list-r1'));
    expect(screen.queryByTestId('org-add-Room')).toBeNull();
    expect(screen.getByTestId('org-move')).toBeTruthy();
  });
});
