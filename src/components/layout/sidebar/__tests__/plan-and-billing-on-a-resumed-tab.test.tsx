/**
 * "Plan & billing" is offered to the admin of a hosted workspace -- including on
 * a tab that resumed its session.
 *
 * Live (paid-lab0925, owner signed in by resuming from the landing chip) the
 * entry never appeared: the slug came only from the connection record, which a
 * resumed tab holds as a bare CID. The tab's selection names the server.
 *
 * Mocked: the tab selection read (IndexedDB), the connection record (the
 * connection manager's in-memory state, set by a sign-in this test does not run),
 * and the permission answer (the permissions service's GetUserPermissions round
 * trip): the reader holds EditWorkspaceConfig, as an Owner or Admin does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkspaceContext, useWorkspace } from '@/contexts/WorkspaceContext';
import { SidebarProvider } from '@/components/ui/sidebar';
import { PermissionsProvider } from '@/contexts/PermissionsContext';

let selectedServer: string = 'acme.work.avarok.net';
vi.mock('@/lib/tab-context', async (importOriginal: () => Promise<Record<string, unknown>>) => ({
  ...(await importOriginal()),
  getSelectedUser: async (): Promise<{ selectedUsername: string; selectedServerAddress: string }> => ({
    selectedUsername: 'pia', selectedServerAddress: selectedServer,
  }),
}));
let connectionAddress: string | undefined = undefined;
vi.mock('@/lib/connection', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const real: Record<string, unknown> = await importOriginal();
  const manager: object = real.connectionManager as object;
  return {
    ...real,
    connectionManager: new Proxy(manager, {
      get(target: object, key: string | symbol): unknown {
        if (key === 'getConnectionInfo') return (): { cid: bigint; serverAddress?: string } => ({ cid: 7n, serverAddress: connectionAddress });
        return Reflect.get(target, key);
      },
    }),
  };
});

vi.mock('@/hooks/use-permission', () => ({
  usePermission: (): import('@/hooks/use-permission-result').UsePermissionResult => ({
    allowed: true, loading: false, unanswered: false, answered: true, reason: null, refresh: async (): Promise<void> => undefined,
  }),
}));

import { AdminSettingsSection } from '../AdminSettingsSection';

function AsMember(): JSX.Element {
  const { state } = useWorkspace();
  return (
    <WorkspaceContext.Provider value={{ state: { ...state, currentUser: { id: 'pia', username: 'pia', name: 'Pia' } } }}>
      {/* Where the app renders it: the section asks whether Workspace settings may be offered. */}
      <PermissionsProvider><SidebarProvider><AdminSettingsSection /></SidebarProvider></PermissionsProvider>
    </WorkspaceContext.Provider>
  );
}

function renderAs(): void {
  render(<AsMember />);
}

// The control plane's /status, at the fetch boundary: the banner's only input. Unset, nothing answers.
let statusBilling: unknown = undefined;
const asked: string[] = [];
beforeEach((): void => {
  statusBilling = undefined;
  asked.length = 0;
  vi.stubGlobal('fetch', async (input: string): Promise<Response> => {
    asked.push(input);
    if (statusBilling === undefined) throw new TypeError('offline');
    return new Response(JSON.stringify({ status: 'active', billing: statusBilling }), { status: 200 });
  });
  document.head.innerHTML = '<meta name="citadel-control-plane" content="/api">';
  selectedServer = 'acme.work.avarok.net';
  connectionAddress = undefined;
});

describe('Plan & billing', () => {
  it('is offered on a resumed tab whose connection record is a bare CID', async () => {
    renderAs();
    expect(await screen.findByRole('button', { name: /plan & billing/i })).toBeInTheDocument();
  });

  it('is offered when the connection record names the hosted server', async () => {
    connectionAddress = 'acme.work.avarok.net';
    selectedServer = 'somewhere.else:12349';
    renderAs();
    expect(await screen.findByRole('button', { name: /plan & billing/i })).toBeInTheDocument();
  });

  it('is not offered for a self-hosted server', async () => {
    selectedServer = 'my.server.example:12349';
    renderAs();
    await screen.findByText('Admin Privileges');
    await new Promise((r: (v: void) => void): void => { setTimeout(r, 50); });
    expect(screen.queryByRole('button', { name: /plan & billing/i })).toBeNull();
  });
});

describe('the billing banner', () => {
  it('shows the level from /status and opens Plan & billing', async () => {
    statusBilling = { state: 'active', alert: 'terminating', overage_billing: false };
    renderAs();
    const banner: HTMLElement = await screen.findByTestId('billing-alert');
    expect(banner).toHaveAttribute('data-level', 'terminating');
    expect(banner).toHaveTextContent(/about to be terminated/);
    expect(asked).toEqual(['/api/tenants/acme/status']);
    fireEvent.click(screen.getByTestId('billing-alert-open'));
    expect(await screen.findByLabelText('Claim code')).toBeInTheDocument();
  });

  it('says nothing at level none', async () => {
    statusBilling = { state: 'active', alert: 'none', overage_billing: true };
    renderAs();
    await screen.findByRole('button', { name: /plan & billing/i });
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(screen.queryByTestId('billing-alert')).toBeNull();
  });

  it('puts a required payment above the level, as an alert', async () => {
    statusBilling = { state: 'payment_required', since: 1792281600, purge_at: 1794873600, alert: 'none', overage_billing: true };
    renderAs();
    const banner: HTMLElement = await screen.findByTestId('billing-alert');
    expect([banner.getAttribute('data-level'), banner.getAttribute('role')]).toEqual(['payment_required', 'alert']);
    expect(banner).toHaveTextContent(/A payment is required/);
  });

  it('is not asked for a self-hosted server', async () => {
    statusBilling = { state: 'active', alert: 'warn', overage_billing: true };
    selectedServer = 'my.server.example:12349';
    renderAs();
    await screen.findByText('Admin Privileges');
    await new Promise((r: (v: void) => void): void => { setTimeout(r, 50); });
    expect(asked).toEqual([]);
    expect(screen.queryByTestId('billing-alert')).toBeNull();
  });
});
