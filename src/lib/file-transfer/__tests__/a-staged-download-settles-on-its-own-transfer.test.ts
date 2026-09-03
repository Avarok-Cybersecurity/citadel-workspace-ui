/**
 * An async download was settled by the wrong message, and resolved a field that
 * does not exist.
 *
 * `server-download.ts` waited on `FileTransferStatusNotification`, matched on
 * `status.cid === cid`. Three things were wrong with that, and the RE-VFS pull
 * had already been corrected for all three:
 *
 *   1. The internal service emits that notification from exactly one place —
 *      `respond_file_transfer.rs`, the accept/decline flow for STANDARD
 *      transfers. A pull auto-accepts and reports through
 *      `FileTransferTickNotification`, so the success branch was unreachable and
 *      every staged download sat until its timeout.
 *   2. `cid` is the SESSION's cid and is on every transfer notification the
 *      session sees, so any concurrent transfer settled an unrelated download.
 *   3. It resolved `status.response?.download_path`. `response` is a plain
 *      `bool` on the wire, so that is `undefined` even on a match — the reported
 *      "saved to" location was a field that has never existed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent: Array<Record<string, unknown>> = [];
vi.mock('../../websocket-service', () => ({
  websocketService: {
    sendMessage: async (request: Record<string, unknown>): Promise<void> => {
      sent.push(request);
    },
  },
}));

const { eventEmitter } = await import('../../event-emitter');
const { downloadFileFromServer } = await import('../server-download');
import type { FileTransfer } from '../types';

const OWN_CID: string = '11792220362710786214';
const LOCAL_PATH: string = '/home/bob/Downloads/notes.md';

function transfer(): FileTransfer {
  return {
    id: 'transfer-1', fileName: 'notes.md', fileSize: 1024, fileType: 'text/markdown',
    mode: 'async', state: 'staged', progress: 0,
    senderCid: '7040934265064422768', recipientCid: OWN_CID,
    createdAt: 0, updatedAt: 0, isIncoming: true,
    virtualPath: '/transfers/transfer-1/notes.md',
  };
}

/**
 * The pull mints its own request_id, so the test reads it back off the frame the
 * mocked socket received rather than guessing one.
 */
async function captureRequestId(): Promise<string> {
  await vi.waitFor((): void => {
    if (!sent.some((m) => 'DownloadFile' in m)) throw new Error('no DownloadFile sent yet');
  });
  const frame: Record<string, unknown> = sent.find((m) => 'DownloadFile' in m) as Record<string, unknown>;
  return (frame.DownloadFile as { request_id: string }).request_id;
}

describe('a staged download', () => {
  beforeEach((): void => { sent.length = 0; });

  it('completes on its own transfer ticks and reports where the bytes landed', async () => {
    const pending: Promise<string | undefined> = downloadFileFromServer(transfer());
    const requestId: string = await captureRequestId();

    eventEmitter.emit('websocket-message', {
      FileTransferTickNotification: {
        request_id: requestId,
        status: { ReceptionBeginning: { path: LOCAL_PATH } },
      },
    });
    eventEmitter.emit('websocket-message', {
      FileTransferTickNotification: { request_id: requestId, status: 'ReceptionComplete' },
    });

    await expect(pending).resolves.toBe(LOCAL_PATH);
  });

  it('is NOT settled by a status notification carrying its own cid', async () => {
    // The exact message the old code matched on. It belongs to a different,
    // concurrent transfer; settling on it is how one download reported another's
    // outcome. Note `response: true` — a bool, which is why reading
    // `.download_path` off it always produced undefined.
    const pending: Promise<string | undefined> = downloadFileFromServer(transfer());
    const requestId: string = await captureRequestId();

    eventEmitter.emit('websocket-message', {
      FileTransferStatusNotification: {
        cid: BigInt(OWN_CID), object_id: 99, success: true, response: true,
        message: null, request_id: 'some-other-transfer',
      },
    });

    const settledEarly: boolean = await Promise.race([
      pending.then(() => true, () => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 50)),
    ]);
    expect(settledEarly).toBe(false);

    // And it still completes correctly afterwards, from its own ticks.
    eventEmitter.emit('websocket-message', {
      FileTransferTickNotification: { request_id: requestId, status: 'ReceptionComplete' },
    });
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when the service refuses the request, naming its reason', async () => {
    const pending: Promise<string | undefined> = downloadFileFromServer(transfer());
    const requestId: string = await captureRequestId();

    eventEmitter.emit('websocket-message', {
      DownloadFileFailure: { request_id: requestId, message: 'no such virtual file' },
    });

    await expect(pending).rejects.toThrow(/no such virtual file/);
  });

  it('rejects a mid-transfer failure rather than resolving an empty path', async () => {
    const pending: Promise<string | undefined> = downloadFileFromServer(transfer());
    const requestId: string = await captureRequestId();

    eventEmitter.emit('websocket-message', {
      FileTransferTickNotification: { request_id: requestId, status: 'Fail' },
    });

    await expect(pending).rejects.toThrow(/failed/);
  });
});
