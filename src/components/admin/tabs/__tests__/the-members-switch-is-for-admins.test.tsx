/**
 * "Members can see each other" shows the node's stored value, to admins only.
 *
 * Real: the switch and the workspace context; only the store's contents are
 * chosen. Mocked: WorkspaceService.setMembersVisible, the network write, so a
 * click can be observed without a server (the write itself is covered by
 * the-members-switch-waits-for-the-server.test.ts).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { WorkspaceContext } from '@/contexts/WorkspaceContext';
import { MembersVisibilitySwitch } from '../MembersVisibilitySwitch';
import type { DomainNode } from '@/components/layout/sidebar/tree-node-types';

const setMembersVisible = vi.fn(async (): Promise<void> => {});
vi.mock('@/lib/workspace-service', () => ({ default: { setMembersVisible: (...args: unknown[]): Promise<void> => setMembersVisible(...(args as [])) } }));

afterEach(() => { cleanup(); setMembersVisible.mockClear(); });

type ContextValue = React.ContextType<typeof WorkspaceContext>;

function renderAs(role: string, viewMembers: boolean, entityType: string = 'office'): void {
  const node: DomainNode = { id: 'o1', default_permissions: { view_members: viewMembers } } as unknown as DomainNode;
  const value: ContextValue = { state: { nodes: { o1: node }, currentUser: { role } } } as unknown as ContextValue;
  render(
    <WorkspaceContext.Provider value={value}>
      <MembersVisibilitySwitch entityType={entityType} entityId="o1" />
    </WorkspaceContext.Provider>,
  );
}

describe('the "Members can see each other" switch', () => {
  it('shows an admin the stored value, off and on', () => {
    renderAs('Admin', false);
    expect(screen.getByTestId('members-visible-toggle').getAttribute('aria-checked')).toBe('false');
    cleanup();
    renderAs('Admin', true);
    expect(screen.getByTestId('members-visible-toggle').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Members can see each other')).toBeTruthy();
  });

  it('is not shown to anyone else, owners included', () => {
    for (const role of ['Member', 'Guest', 'Owner']) {
      renderAs(role, true);
      expect(screen.queryByTestId('members-visible-setting'), role).toBeNull();
      cleanup();
    }
  });

  it('has no place on the workspace, which is not a node', () => {
    renderAs('Admin', true, 'workspace');
    expect(screen.queryByTestId('members-visible-setting')).toBeNull();
  });

  it('sends the new value for this node', async () => {
    renderAs('Admin', true);
    await act(async (): Promise<void> => { fireEvent.click(screen.getByTestId('members-visible-toggle')); });
    expect(setMembersVisible).toHaveBeenCalledWith('o1', false);
  });
});
