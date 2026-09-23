/**
 * The path the agent reports for a connection is kept with that connection and
 * shown beside it.
 *
 * The agent reports it on PeerConnectSuccess, on both the connecting and the
 * accepting side; the auto-connect listener writes it into the connected-peers
 * store, the peer hooks read it back through `connectionPathFor`, and the row
 * names it. Nothing
 * here is mocked: the service singleton (whose constructor installs the
 * listeners), the store and the row are the production ones.
 */
import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { PeerListRow } from '../PeerListRow';
import { eventEmitter } from '@/lib/event-emitter';
import { p2pAutoConnectService, connectionPathFor } from '@/lib/p2p-auto-connect-service';
import { CONNECTION_PATH_COPY } from '@/lib/ice-servers/path-copy';
import type { PeerConnectPath } from '@/types/ice-servers';

const OURS: bigint = 9001n;
const PEER: bigint = 9002n;

function renderRow(isConnected: boolean | null, connectionPath: PeerConnectPath | null): HTMLElement {
  render(
    <SidebarProvider>
      <PeerListRow cid="9002" username="ada" isOnline isConnected={isConnected} connectionPath={connectionPath} onClick={vi.fn()} />
    </SidebarProvider>,
  );
  return screen.getByTestId('peer-row-ada');
}

describe('the reported connection path', () => {
  it('is stored for both ends, survives a re-confirmation, and goes with the connection', () => {
    const service: typeof p2pAutoConnectService = p2pAutoConnectService;
    service.setPeerConnected(OURS, PEER);
    eventEmitter.emit('websocket-message', { PeerConnectSuccess: { cid: OURS, peer_cid: PEER, request_id: null, path: 'turn' } });

    expect(connectionPathFor(OURS, PEER)).toBe('turn');
    expect(connectionPathFor(PEER, OURS)).toBe('turn');
    expect(connectionPathFor(null, PEER)).toBeNull();

    service.setPeerConnected(OURS, PEER);
    expect(connectionPathFor(OURS, PEER)).toBe('turn');

    service.setPeerDisconnected(OURS, PEER);
    service.setPeerConnected(OURS, PEER);
    expect(connectionPathFor(OURS, PEER)).toBeNull();
  });

  it('is recorded on the accepting side too, and not at all from an agent that omits it', () => {
    const ACCEPTOR: bigint = 9101n;
    const INITIATOR: bigint = 9102n;
    eventEmitter.emit('websocket-message', { PeerConnectSuccess: { cid: ACCEPTOR, peer_cid: INITIATOR, request_id: null, path: 'server_relay' } });
    expect(connectionPathFor(ACCEPTOR, INITIATOR)).toBe('server_relay');

    const OLD: bigint = 9201n;
    eventEmitter.emit('websocket-message', { PeerConnectSuccess: { cid: OLD, peer_cid: INITIATOR, request_id: null } });
    expect(connectionPathFor(OLD, INITIATOR)).toBeNull();
  });

  it.each([
    ['turn', CONNECTION_PATH_COPY.turn],
    ['direct', CONNECTION_PATH_COPY.direct],
    ['server_relay', CONNECTION_PATH_COPY.server_relay],
  ] as const)('names %s on a connected row', (path: PeerConnectPath, copy: string) => {
    const row: HTMLElement = renderRow(true, path);
    expect(row.textContent ?? '').toContain(`Connected, ${copy}`);
    expect(row.querySelector(`[data-connection-path="${path}"]`)?.getAttribute('title')).toBe(`Connected · ${copy}`);
  });

  it('names no path for a row that is not connected, or whose path is unknown', () => {
    const stale: HTMLElement = renderRow(false, 'turn');
    expect(stale.textContent ?? '').not.toContain(CONNECTION_PATH_COPY.turn);
    cleanup();

    const unknown: HTMLElement = renderRow(true, null);
    expect(unknown.textContent ?? '').toContain('Connected');
    expect(unknown.querySelector('[data-connection-path]')).toBeNull();
  });
});
