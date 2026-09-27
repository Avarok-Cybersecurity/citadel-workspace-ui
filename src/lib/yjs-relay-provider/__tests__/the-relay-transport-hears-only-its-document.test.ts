/**
 * A server broadcast reaches the relay transport of its own document only, bytes intact.
 *
 * Real: the response router (handleGroupVariants), the event emitter and the base64 codec.
 * Stubbed: the two workspace-service calls, which are network I/O (LiveDocApi).
 */
import { describe, it, expect, vi, type Mock } from 'vitest';
import type { RelayTransport } from '../relay-provider';
import { handleGroupVariants } from '@/lib/workspace-response-handler/group-handlers';
import type { ConnectionInfo } from '@/lib/workspace-response-handler/workspace-handlers';
import { relayTransport, toBase64, fromBase64, type LiveDocApi } from '../relay-transport';

// The router passes it through to message events; a live-document broadcast does not read it.
const connection: ConnectionInfo = { cid: 1, request_id: 'r' };
const bytes: Uint8Array = new Uint8Array([0, 1, 2, 250, 255, 128]);

const api: LiveDocApi = {
  openLiveDoc: async () => ({ seq: 4, state: toBase64(bytes) }),
  sendLiveDocUpdate: async (_g: string, _d: string, update: string) => (update === toBase64(bytes) ? 5 : -1),
};

describe('the relay transport', () => {
  it('round-trips every byte value through base64', () => {
    const all: Uint8Array = Uint8Array.from({ length: 256 }, (_v: unknown, i: number) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
  });

  it('opens with the decoded state and sends the encoded update', async () => {
    const transport: RelayTransport = relayTransport(api, 'g1', 'd1');
    expect(await transport.open()).toEqual({ seq: 4, state: bytes });
    expect(await transport.send(bytes)).toBe(5);
  });

  it('hears a routed broadcast of its document, and no other', () => {
    const heard: Mock<(seq: number, update: Uint8Array) => void> = vi.fn();
    const stop: () => void = relayTransport(api, 'g1', 'd1').onRemote(heard);
    const broadcast = (group: string, doc: string, seq: number): void => {
      expect(handleGroupVariants({ LiveDocUpdated: { group_id: group, doc_id: doc, seq, update: toBase64(bytes) } }, connection)).toBe(true);
    };
    broadcast('g1', 'd2', 1);
    broadcast('g2', 'd1', 2);
    broadcast('g1', 'd1', 3);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith(3, bytes);
    stop();
    broadcast('g1', 'd1', 4);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
