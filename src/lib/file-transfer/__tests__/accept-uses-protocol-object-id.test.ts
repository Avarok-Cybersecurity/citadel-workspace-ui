/**
 * Accepting an incoming transfer must name the PROTOCOL's object_id.
 *
 * A transfer arrives as two events with two different names for it: the bytes
 * come over SendFile carrying a numeric `object_id`, and the bubble comes as a
 * P2P message carrying a `crypto.randomUUID()`. Accept goes back over the
 * protocol, so it has to name the object_id.
 *
 * It passed the UUID through to `BigInt(params.protocolId)`, which throws
 * SyntaxError synchronously while the request literal is built — before
 * anything is sent. `RespondFileTransfer` was therefore never issued for ANY
 * incoming transfer: the offer was never accepted and the bytes never landed.
 *
 * This test drives the REAL FileTransferIO and mocks only the socket. The
 * existing accept test mocks `io` wholesale, which is exactly why this survived
 * — the mock stood precisely where the defect was.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type SentRequest = { RespondFileTransfer: { object_id: bigint; accept: boolean } };
const sendRequest = vi.fn(async (_request: unknown): Promise<void> => undefined);
vi.mock('@/lib/websocket-service', () => ({
  websocketService: { sendRequest: (r: unknown) => sendRequest(r) },
}));

import { FileTransferIO } from '../io';

const UUID = '6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8';
const OBJECT_ID = '90210';

/** Reach the accept path exactly as the lifecycle does. */
async function accept(io: FileTransferIO, transferId: string) {
  await io.executeIntent({
    type: 'send-response',
    transferId,
    targetCid: '42',
    accepted: true,
  });
}

describe('accepting a transfer', () => {
  beforeEach(() => sendRequest.mockClear());

  it('sends the protocol object_id, not the announcement UUID', async () => {
    const io = new FileTransferIO();
    io.registerTransferMapping(UUID, OBJECT_ID);

    await accept(io, UUID);

    expect(sendRequest).toHaveBeenCalledTimes(1);
    const sent = sendRequest.mock.calls[0]?.[0] as SentRequest;
    expect(sent.RespondFileTransfer.object_id).toBe(BigInt(OBJECT_ID));
    expect(sent.RespondFileTransfer.accept).toBe(true);
  });

  it('refuses with a readable message when the two halves are not joined yet', async () => {
    const io = new FileTransferIO();

    // No mapping registered — the bubble arrived, the bytes have not.
    await expect(accept(io, UUID)).rejects.toThrow(/not been announced over the protocol/);

    // The point of the guard: nothing is sent, and the failure is not a raw
    // BigInt parse error the user cannot act on.
    expect(sendRequest).not.toHaveBeenCalled();
  });
});
