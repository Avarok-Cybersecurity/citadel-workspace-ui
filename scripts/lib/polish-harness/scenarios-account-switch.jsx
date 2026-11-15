/**
 * The top bar's account switcher with an account the agent no longer holds, the sign-in
 * that row opens, and that sign-in scoped to its server. Real components; the rows and the
 * browser's saved accounts are input (there is no agent here to keep them).
 */
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { WorkspaceSwitcherDropdown } from '@/components/layout/sidebar/WorkspaceSwitcherDropdown';
import { Login } from '@/components/Login';
import { PasskeySignIn } from '@/components/passkey/PasskeySignIn';
import { connectionManager } from '@/lib/connection';
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

const BENCH = 'bench.work.avarok.net';
const ACME = 'acme-research-and-development-laboratories.work.avarok.net';

/** The browser's saved accounts, which the agent's LocalDB would hold: alice on bench, bob on acme. */
function savedAccounts() {
  const sessions = [{ username: 'alice', serverAddress: BENCH, cid: 1n }, { username: 'bob', serverAddress: ACME, cid: 2n }];
  connectionManager.getStoredSessions = () => ({ sessions });
}

function SignInScoped() {
  savedAccounts();
  return <MemoryRouter><Login initialUsername={undefined} scope={BENCH} onNext={() => {}} onCancel={() => {}} /></MemoryRouter>;
}

function SignInScopeEmpty() {
  return <MemoryRouter><Login initialUsername={undefined} scope="new-workspace.work.avarok.net" onNext={() => {}} onCancel={() => {}} /></MemoryRouter>;
}

function PasskeyRows() {
  const rows = [{ username: 'alice', server: BENCH }, { username: 'alice', server: ACME }, { username: 'margaret.hamilton.apollo', server: null }];
  return <div style={{ padding: 16, maxWidth: 400 }}><PasskeySignIn accounts={rows} onUse={() => {}} disabled={false} /></div>;
}

export const ACCOUNT_SWITCH_SCENARIOS = {
  'switcher-signed-out': SwitcherSignedOut, 'sign-in-signed-out': SignInSignedOut,
  'sign-in-scoped': SignInScoped, 'sign-in-scope-empty': SignInScopeEmpty, 'passkey-rows': PasskeyRows,
};
