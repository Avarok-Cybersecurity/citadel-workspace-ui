/**
 * What the workspace loader shows, and whether it gives up for /connect -- decided
 * here, from what the loader knows, so the rules can be read and tested apart from
 * the effects that carry them out.
 *
 * `reconnectingTo` is the agent's own report that it is bringing this session's
 * server link back (server-reconnect.ts). While it stands, neither "no connection"
 * nor "no data yet" is a reason to leave: /connect cannot help a session the agent
 * is already restoring, and the data comes once the link does. And while it stands, a tree
 * kept on this device (`keptTree`) lets the workspace open, labelled as offline, rather than
 * hold every document behind the spinner until the server answers.
 */
import { reconnectingMessage } from '@/lib/reconnect/server-reconnect';

export interface LoaderInputs {
  isLoading: boolean;
  isAutoClaiming: boolean;
  loadingTimeout: boolean;
  hasConnection: boolean | null;
  workspaceDataTimeout: boolean;
  heldElsewhere: boolean;
  reconnectingTo: string | null;
  /** A last-known tree is kept on this device for this session's account. */
  keptTree: boolean;
}

export type LoaderView =
  | { kind: 'ready' }
  | { kind: 'held-elsewhere' }
  | { kind: 'spinner'; message: string; showConnectButton: boolean };

export function shouldLeaveForConnect(inputs: LoaderInputs): boolean {
  return inputs.loadingTimeout
    && !inputs.hasConnection
    && inputs.isLoading
    && !inputs.isAutoClaiming
    && !inputs.heldElsewhere
    && inputs.reconnectingTo === null;
}

function spinnerMessage(inputs: LoaderInputs): string {
  if (inputs.isAutoClaiming) return 'Connecting to session...';
  if (inputs.reconnectingTo !== null) return reconnectingMessage(inputs.reconnectingTo);
  if (inputs.workspaceDataTimeout) return 'Workspace data is taking longer than expected...';
  if (inputs.loadingTimeout) return 'Checking connection...';
  return 'Loading workspace...';
}

export function loaderView(inputs: LoaderInputs): LoaderView {
  if (inputs.isLoading && inputs.heldElsewhere) return { kind: 'held-elsewhere' };
  if (!inputs.isLoading && !inputs.isAutoClaiming) return { kind: 'ready' };
  if (inputs.reconnectingTo !== null && inputs.keptTree && !inputs.isAutoClaiming) return { kind: 'ready' };
  const waitingOnTheAgent: boolean = inputs.reconnectingTo !== null;
  return {
    kind: 'spinner',
    message: spinnerMessage(inputs),
    showConnectButton: !waitingOnTheAgent
      && ((inputs.loadingTimeout && !inputs.isAutoClaiming) || inputs.workspaceDataTimeout),
  };
}
