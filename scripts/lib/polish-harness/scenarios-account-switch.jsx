/**
 * The top bar's account switcher with an account the agent no longer holds, and the
 * sign-in that row opens. Real components; the rows are input, as the switcher builds them.
 */
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { WorkspaceSwitcherDropdown } from '@/components/layout/sidebar/WorkspaceSwitcherDropdown';
import { Login } from '@/components/Login';
import { signedOutSignIn } from '@/lib/sessions/sign-in-request';

const row = (username, fullName, signedIn, cid) => ({
  id: `bench.work.avarok.net-${username}`, username, serverAddress: 'bench.work.avarok.net', workspaceName: 'Bench',
  isActive: false, cid, fullName, administers: false, signedIn,
});
const ROWS = [
  row('ada', 'Ada Lovelace', true, 1n),
  row('bob', 'Bob K', true, 2n),
  row('margaret.hamilton.apollo', 'Margaret Hamilton of the Apollo Guidance Computer team', false, 3n),
];

function SwitcherSignedOut() {
  return (
    <div style={{ padding: 16, maxWidth: 320 }}>
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger asChild><button type="button" style={{ width: '100%' }}>Bench</button></DropdownMenuTrigger>
        <WorkspaceSwitcherDropdown
          availableWorkspaces={ROWS} currentWorkspace={ROWS[0]} isSwitching={false}
          onWorkspaceChange={() => {}} onAddAccountToWorkspace={() => {}} onAddWorkspace={() => {}} onManageAccounts={() => {}}
        />
      </DropdownMenu>
    </div>
  );
}

function SignInSignedOut() {
  const [closed, setClosed] = useState(false);
  const request = signedOutSignIn('margaret.hamilton.apollo', 'wss://bench.work.avarok.net/');
  if (closed) return <p data-testid="sign-in-closed">closed</p>;
  return (
    <MemoryRouter>
      <Login initialUsername={request.username} notice={request.notice} onNext={() => {}} onCancel={() => setClosed(true)} />
    </MemoryRouter>
  );
}

export const ACCOUNT_SWITCH_SCENARIOS = { 'switcher-signed-out': SwitcherSignedOut, 'sign-in-signed-out': SignInSignedOut };
