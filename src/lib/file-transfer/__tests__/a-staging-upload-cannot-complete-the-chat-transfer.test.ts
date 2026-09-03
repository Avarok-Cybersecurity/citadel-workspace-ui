/**
 * The sender's own async staging upload completed the chat transfer it was
 * staging FOR.
 *
 * The incoming tick path learned to drop foreign (revfs) streams at
 * ReceptionBeginning, whose metadata names the transfer_type. The OUTGOING
 * path got no twin: sender-side variants (TransferBeginning / TransferTick /
 * TransferComplete) are bare strings and tuples with no metadata, so nothing
 * ever marked an outgoing stream foreign — and the async staging upload IS a
 * revfs push whose sender-side ticks come back stamped with the upload's own
 * SendFile request_id (`take_push` in object_transfer_handle.rs).
 *
 * Those ticks resolved to no transferId, so the service's peer-pair fallback
 * pinned them on the oldest live transfer for (cid, peer): the pending chat
 * transfer. Its TransferComplete marked that transfer 'complete' ("Sent
 * successfully") while the file was only STAGED — and 'complete' is terminal,
 * so the recipient's later real decline was swallowed. A Fail tick likewise
 * errored a chat transfer whose bytes were fine.
 *
 * The fix is in two halves and this file exercises the wiring of both:
 * uploadFileToServer registers its request_id as foreign BEFORE sending, and
 * tick-events drops outgoing events whose request_id is foreign.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../tab-context', () => ({
  getSelectedUser: async (): Promise<{ selectedCid: bigint }> => ({ selectedCid: 7n }),
}));

const sent: Array<Record<string, unknown>> = [];
vi.mock('../../websocket-service', () => ({
  websocketService: {
    sendMessage: async (request: Record<string, unknown>): Promise<void> => { sent.push(request); },
    sendRequest: async (request: Record<string, unknown>): Promise<void> => { sent.push(request); },
    sendP2PMessageReliable: async (): Promise<void> => undefined,
  },
}));

const { eventEmitter } = await import('../../event-emitter');
const { FileTransferIO } = await import('../io');
import type { TransferCompleteEvent, TransferProgressEvent } from '../io-router-types';

const OWN_CID: bigint = 7n;
const PEER_CID: bigint = 42n;

function stagingFile(): File {
  return {
    name: 'report.pdf',
    size: 4,
    arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array([1, 2, 3, 4]).buffer,
  } as unknown as File;
}

function tick(requestId: string, status: unknown): Record<string, unknown> {
  return {
    FileTransferTickNotification: {
      cid: OWN_CID, peer_cid: PEER_CID, request_id: requestId, status,
    },
  };
}

/** Run the real staging upload through the real router and return its request_id. */
async function stageUpload(io: InstanceType<typeof FileTransferIO>): Promise<string> {
  const upload: Promise<unknown> = io.executeIntent({
    type: 'upload-to-server',
    file: stagingFile(),
    transferId: 'chat-transfer-1',
    recipientCid: PEER_CID.toString(),
  });
  await vi.waitFor((): void => {
    if (!sent.some((m) => 'SendFile' in m)) throw new Error('no SendFile yet');
  });
  const requestId: string = (
    (sent.find((m) => 'SendFile' in m) as Record<string, unknown>).SendFile as { request_id: string }
  ).request_id;
  eventEmitter.emit('websocket-message', { SendFileRequestSuccess: { request_id: requestId } });
  await upload;
  return requestId;
}

describe('the async staging upload\'s own tick stream', () => {
  let io: InstanceType<typeof FileTransferIO>;
  let completes: TransferCompleteEvent[];
  let progresses: TransferProgressEvent[];

  beforeEach((): void => {
    sent.length = 0;
    io = new FileTransferIO();
    completes = [];
    progresses = [];
    io.onComplete((e: TransferCompleteEvent): void => { completes.push(e); });
    io.onProgress((e: TransferProgressEvent): void => { progresses.push(e); });
  });

  afterEach((): void => {
    io.dispose();
  });

  it('does not emit a completion the service could pin on the chat transfer', async () => {
    const requestId: string = await stageUpload(io);

    eventEmitter.emit('websocket-message', tick(requestId, 'TransferComplete'));

    expect(
      completes,
      'the staging stream\'s TransferComplete leaked through; the peer-pair fallback will mark the chat transfer complete while the file is only staged',
    ).toEqual([]);
  });

  it('does not emit progress that would drag the chat transfer into transferring', async () => {
    const requestId: string = await stageUpload(io);

    eventEmitter.emit('websocket-message', tick(requestId, 'TransferBeginning'));
    eventEmitter.emit('websocket-message', tick(requestId, { TransferTick: [1, 2, 50] }));

    expect(progresses).toEqual([]);
  });

  it('does not emit a failure that would error an unrelated chat transfer', async () => {
    const requestId: string = await stageUpload(io);

    eventEmitter.emit('websocket-message', tick(requestId, { Fail: 'disk full' }));

    expect(completes).toEqual([]);
  });

  it('still delivers a genuine chat send\'s completion — foreign filtering must not become "drop everything outgoing"', async () => {
    await stageUpload(io);

    // A standard FileTransfer sender stream is stamped with the localhost
    // TCP-connection uuid (spawn_tick_updater's fallback), which nothing has
    // marked foreign. Its completion must still reach the service.
    const tcpConnectionUuid: string = 'aaaaaaaa-1111-2222-3333-444444444444';
    eventEmitter.emit('websocket-message', tick(tcpConnectionUuid, 'TransferComplete'));

    expect(completes).toHaveLength(1);
    expect(completes[0]).toMatchObject({ direction: 'outgoing', success: true, transferId: undefined });
  });
});
