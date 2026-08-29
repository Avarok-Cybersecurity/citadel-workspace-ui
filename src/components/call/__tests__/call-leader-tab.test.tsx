/**
 * One browser has one WebSocket, held by an elected leader tab. Follower tabs
 * finish initialisation with a null client, so calling from one used to throw
 * on open, no-op on close and drop every frame — a call that looked placed and
 * carried nothing. These cover the two places that now depend on which tab
 * this is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const state: { isLeader: boolean; } = { isLeader: true };
vi.mock('@/lib/multi-instance', () => ({
  instanceManager: {
    get isLeader() {
      return state.isLeader;
    },
  },
}));
vi.mock('@/lib/call/codec-support', () => ({
  probeMediaCapabilities: (): Promise<{ supported: boolean; }> => Promise.resolve({ supported: true }),
  localCapabilities: (): Promise<{}> => Promise.resolve({}),
}));
vi.mock('@/lib/call/call-manager', () => ({ CallManager: class {} }));
vi.mock('@/lib/call/websocket-call-transport', () => ({ WebSocketCallTransport: class {} }));
vi.mock('@/lib/call/peer-name', () => ({ callPeerName: (): string => 'Peer' }));

import { eventEmitter } from '@/lib/event-emitter';
import { CallProvider } from '../CallProvider';
import { useCall } from '@/lib/call/call-context';

function CapabilityProbe() {
  const { capability } = useCall();
  return <span data-testid="reason">{capability.supported ? 'available' : capability.reason}</span>;
}

function renderProvider() {
  return render(
    <CallProvider selfCid={11n} senderConfig={{} as never}>
      <CapabilityProbe />
    </CallProvider>,
  );
}

beforeEach(() => {
  state.isLeader = true;
});

describe('calling and the leader tab', () => {
  it('offers calling in the tab that owns the WebSocket', async () => {
    renderProvider();
    await act(async () => {});
    expect(screen.getByTestId('reason')).toHaveTextContent('available');
  });

  it('explains itself in a follower tab instead of failing silently', async () => {
    state.isLeader = false;
    renderProvider();
    await act(async () => {});

    // The control stays visible and carries a reason; CallEntryButtons renders
    // exactly this string into its tooltip.
    expect(screen.getByTestId('reason')).toHaveTextContent(
      'Calls run in whichever Citadel tab you opened first',
    );
  });

  it('follows a later election rather than latching the first answer', async () => {
    state.isLeader = false;
    renderProvider();
    await act(async () => {});
    expect(screen.getByTestId('reason')).not.toHaveTextContent('available');

    // Leadership moves when the previous leader's tab closes; calling must
    // become available here without a reload.
    state.isLeader = true;
    await act(async () => {
      eventEmitter.emit('instance:leader-changed', { isLeader: true, leaderId: 'x' });
    });

    expect(screen.getByTestId('reason')).toHaveTextContent('available');
  });
});
