import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent: Array<Record<string, unknown>> = [];
vi.mock('../../websocket-service', () => ({
  websocketService: {
    sendMessage: async (request: Record<string, unknown>): Promise<void> => {
      sent.push(request);
    },
  },
}));

const {
  MAX_BYTE_CONTENTS_BYTES,
  stagedTransferPath,
  uploadFileToServer,
} = await import('../server-upload');
import { downloadFileFromServer } from '../server-download';
import type { FileTransfer } from '../types';

/**
 * These cover the fail-fast guards on the staged ("async") transfer path — the
 * checks that reject before any I/O happens, so they need no socket.
 *
 * The guards matter because both functions previously reported success for work
 * that never occurred: the upload synthesised a `/transfers/{id}/{name}` path for
 * a file the service could not open and returned that same path from its `catch`,
 * and the download sent a request whose field names did not match the protocol at
 * all, swallowed the failure, and let the caller mark the transfer complete.
 *
 * The full round trip is exercised by the file-transfer integration spec, which
 * runs against a real internal service rather than a mocked socket.
 */

/**
 * `uploadFileToServer` must register its request_id as a foreign OUTGOING tick
 * stream before sending (defect: the staging stream's TransferComplete used to
 * complete the pending CHAT transfer). These tests record the registration;
 * the routing consequence is covered in
 * a-staging-upload-cannot-complete-the-chat-transfer.test.ts.
 */
const markedForeign: string[] = [];
const markForeign = (requestId: string): void => { markedForeign.push(requestId); };

function transfer(overrides: Partial<FileTransfer> = {}): FileTransfer {
  return {
    id: 'transfer-1',
    fileName: 'notes.md',
    fileSize: 1024,
    fileType: 'text/markdown',
    mode: 'async',
    state: 'staged',
    progress: 0,
    senderCid: '7040934265064422768',
    recipientCid: '11792220362710786214',
    createdAt: 0,
    updatedAt: 0,
    isIncoming: true,
    ...overrides,
  };
}

describe('uploadFileToServer', () => {
  it('rejects a file above the inline-payload cap before reading its bytes', async () => {
    // Deliberately no `arrayBuffer` implementation: if the guard did not fire
    // first, this would throw a TypeError instead of the size error, so the test
    // also pins that the check happens *before* the file is read into memory.
    const oversized: File = {
      name: 'huge.bin',
      size: MAX_BYTE_CONTENTS_BYTES + 1,
    } as unknown as File;

    await expect(uploadFileToServer(oversized, 'transfer-1', '123', 7n, markForeign)).rejects.toThrow(
      /above the .* limit for browser uploads/s
    );
  });

  it('names the offending file and the limit so the message is actionable', async () => {
    const oversized: File = { name: 'huge.bin', size: 32 * 1024 * 1024 } as unknown as File;
    await expect(uploadFileToServer(oversized, 'transfer-1', '123', 7n, markForeign)).rejects.toThrow(
      /"huge\.bin" is 32\.0 MiB, above the 16\.0 MiB limit/
    );
  });

  it('mirrors the service-side ByteContents cap exactly', () => {
    // The authority is MAX_BYTE_CONTENTS_BYTES in the internal service's
    // requests/file/upload.rs. If that changes, this must change with it —
    // otherwise uploads fail on arrival instead of failing here with a
    // message that tells the user what to do instead.
    expect(MAX_BYTE_CONTENTS_BYTES).toBe(16 * 1024 * 1024);
  });
});

/**
 * The value the sender returns is used as a server path by two other places, so
 * it has to be one.
 *
 * It used to be `staged:{id}/{name}`, and the comment above it said in as many
 * words that this was NOT a server path — while `transfer-announcement.ts`
 * shipped it to the peer as `virtual_path` and `server-download.ts` sent it
 * straight back as `DownloadFile.virtual_directory`. The recipient was asking
 * the service to read a virtual directory called `staged:abc/notes.md`.
 *
 * The previous test asserted the `staged:` prefix was correct and that the value
 * did NOT start with `/`. It pinned the defect in place.
 */
describe('stagedTransferPath', () => {
  it('is a real virtual path, because it is used as one', () => {
    expect(stagedTransferPath('abc', 'notes.md')).toBe('/transfers/abc/notes.md');
  });

  it('carries no scheme-like prefix that a path consumer would choke on', () => {
    const path: string = stagedTransferPath('abc', 'notes.md');
    expect(path.startsWith('/')).toBe(true);
    expect(path).not.toMatch(/^[a-z]+:/);
  });
});

/**
 * The upload has to create the virtual_path key that the download addresses.
 *
 * `transfer_type` was `'FileTransfer'` — the LIVE peer-to-peer variant, which
 * requires the recipient online to accept it. So "async" mode staged nothing at
 * all: it opened a live transfer, returned a made-up reference, and the whole
 * offline-delivery feature could not have worked in any circumstance.
 *
 * This is the identical mistake `revfs-io-network.ts` was corrected for, with
 * the correction never carried across. Asserting on the REQUEST OBJECT is the
 * only way to see it — every higher-level test mocks the intent out.
 */
describe('the staged upload request', () => {
  beforeEach((): void => { sent.length = 0; markedForeign.length = 0; });

  function tinyFile(): File {
    return {
      name: 'notes.md',
      size: 4,
      arrayBuffer: async (): Promise<ArrayBuffer> => new Uint8Array([1, 2, 3, 4]).buffer,
    } as unknown as File;
  }

  function lastSendFile(): Record<string, unknown> {
    const frame: Record<string, unknown> | undefined = sent.find((m) => 'SendFile' in m);
    if (!frame) throw new Error('no SendFile request was sent');
    return frame.SendFile as Record<string, unknown>;
  }

  it('stages under RemoteEncryptedVirtualFilesystem, not a live FileTransfer', async () => {
    void uploadFileToServer(tinyFile(), 'transfer-1', '123', 7n, markForeign);
    await vi.waitFor((): void => { lastSendFile(); });

    const transferType: unknown = lastSendFile().transfer_type;
    expect(transferType).not.toBe('FileTransfer');
    expect(transferType).toHaveProperty('RemoteEncryptedVirtualFilesystem');
  });

  it('stages at the exact path the recipient will ask to download', async () => {
    void uploadFileToServer(tinyFile(), 'transfer-1', '123', 7n, markForeign);
    await vi.waitFor((): void => { lastSendFile(); });

    const transferType: { RemoteEncryptedVirtualFilesystem?: { virtual_path?: string; security_level?: string; }; } =
      lastSendFile().transfer_type as {
        RemoteEncryptedVirtualFilesystem?: { virtual_path?: string; security_level?: string };
      };

    // The two halves of one transfer must name the same key and negotiate the
    // same level, or the download addresses something that is not there.
    expect(transferType.RemoteEncryptedVirtualFilesystem?.virtual_path).toBe(
      stagedTransferPath('transfer-1', 'notes.md')
    );
    expect(transferType.RemoteEncryptedVirtualFilesystem?.security_level).toBe('Standard');
  });

  it('marks its own request_id as a foreign outgoing stream', async () => {
    // The service stamps the staging stream's sender-side ticks with exactly
    // this id; unmarked, the stream's TransferComplete completed the pending
    // chat transfer for the same peer while the file was only staged.
    void uploadFileToServer(tinyFile(), 'transfer-1', '123', 7n, markForeign);
    await vi.waitFor((): void => { lastSendFile(); });

    expect(markedForeign).toEqual([lastSendFile().request_id]);
  });

  it('sends the file bytes inline, since the browser has no path to hand over', async () => {
    void uploadFileToServer(tinyFile(), 'transfer-1', '123', 7n, markForeign);
    await vi.waitFor((): void => { lastSendFile(); });

    const source: { ByteContents?: { data?: number[]; file_name?: string; }; } =
      lastSendFile().source as { ByteContents?: { data?: number[]; file_name?: string } };
    expect(source.ByteContents?.file_name).toBe('notes.md');
    expect(source.ByteContents?.data).toEqual([1, 2, 3, 4]);
  });
});

describe('downloadFileFromServer', () => {
  it('rejects a transfer that was never staged rather than sending a null path', async () => {
    await expect(downloadFileFromServer(transfer({ virtualPath: undefined }))).rejects.toThrow(
      /no staged path on the server/
    );
  });

  it('rejects rather than resolving undefined, so the caller cannot mark it complete', async () => {
    // acceptTransfer() completes the transfer on a resolved promise. A resolve
    // here would recreate the original bug in a new place.
    await expect(
      downloadFileFromServer(transfer({ virtualPath: '' }))
    ).rejects.toBeInstanceOf(Error);
  });
});
