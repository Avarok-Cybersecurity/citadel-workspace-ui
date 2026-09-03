/**
 * Sending an over-cap file announced the offer and then threw.
 *
 * `executeSendTransferRequest` announced the transfer to the recipient FIRST
 * and only then handed the bytes to the router, whose inline-payload cap threw
 * on any browser File above it. The recipient was left a live-looking 7-day
 * offer for bytes that would never arrive, and the sender a 'pending' record
 * nothing ever errored — the exact half-action already fixed for empty files
 * (see an-empty-file-is-refused-before-it-is-announced.test.ts); the size
 * guard never migrated ahead of the announcement.
 *
 * Compounding it, TWO constants governed the same inline ByteContents wire
 * format: a private 2 MiB cap in send-operations and the 16 MiB service mirror
 * in server-upload (the internal service's requests/file/upload.rs is the
 * authority at 16 MiB). So a 3 MiB file staged fine in async mode and died
 * post-announcement in p2p mode. One constant now; the guard here uses it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const announced: unknown[] = [];
vi.mock('../in-band-signals', () => ({
  sendLayerPayload: async (payload: unknown): Promise<void> => { announced.push(payload); },
}));

const { executeSendTransferRequest } = await import('../send-transfer-request');
const { MAX_BYTE_CONTENTS_BYTES } = await import('../server-upload');
import { wrapInMemory } from '../types';
import type { FileTransfer, SendTransferRequestIntent } from '../types';
import type { RealProtocolIORouter } from '../real-protocol-io-router';

function transfer(fileSize: number): FileTransfer {
  return {
    id: 'transfer-1', fileName: 'big.bin', fileSize, fileType: 'application/octet-stream',
    mode: 'p2p', state: 'pending', progress: 0,
    senderCid: '7', recipientCid: '42',
    createdAt: 0, updatedAt: 0, isIncoming: false,
  };
}

function file(size: number): File {
  return {
    name: 'big.bin', size, type: 'application/octet-stream',
    arrayBuffer: async (): Promise<ArrayBuffer> => new ArrayBuffer(0),
  } as unknown as File;
}

function intent(size: number): SendTransferRequestIntent {
  return { type: 'send-transfer-request', transfer: transfer(size), file: wrapInMemory(file(size)) };
}

describe('a p2p send above the inline cap', () => {
  const sendFile: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<unknown> => ({}));
  const router: RealProtocolIORouter = { sendFile } as unknown as RealProtocolIORouter;

  beforeEach((): void => {
    announced.length = 0;
    sendFile.mockClear();
  });

  it('is refused with the cap and the alternative named', async () => {
    await expect(
      executeSendTransferRequest(router, intent(MAX_BYTE_CONTENTS_BYTES + 1)),
    ).rejects.toThrow(/inline browser uploads are capped .* native file picker/s);
  });

  it('announces nothing — the recipient must never see an offer for undeliverable bytes', async () => {
    // The whole defect: the announcement reached the peer before the throw,
    // leaving them a phantom offer they could accept for seven days.
    await expect(
      executeSendTransferRequest(router, intent(MAX_BYTE_CONTENTS_BYTES + 1)),
    ).rejects.toThrow();

    expect(announced, 'the offer was announced before the size guard fired').toEqual([]);
    expect(sendFile).not.toHaveBeenCalled();
  });

  it('still announces and sends a file under the cap, announcement first', async () => {
    // The opposite over-correction: refusing everything passes the two tests
    // above. 3 MiB is chosen deliberately — the old private 2 MiB cap refused
    // it while the service accepts up to 16 MiB.
    let announcedWhenBytesWent: number = -1;
    sendFile.mockImplementation(async (): Promise<unknown> => {
      announcedWhenBytesWent = announced.length;
      return {};
    });

    await executeSendTransferRequest(router, intent(3 * 1024 * 1024));

    expect(announced).toHaveLength(1);
    expect(sendFile).toHaveBeenCalledTimes(1);
    // The bubble must exist by the time ticks arrive, so announce precedes bytes.
    expect(announcedWhenBytesWent, 'the byte send went out before the announcement').toBe(1);
  });
});
