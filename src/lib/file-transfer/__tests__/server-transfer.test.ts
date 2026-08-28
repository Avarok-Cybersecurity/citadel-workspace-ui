import { describe, it, expect } from 'vitest';
import {
  MAX_BYTE_CONTENTS_BYTES,
  stagedTransferRef,
  uploadFileToServer,
} from '../server-upload';
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

    await expect(uploadFileToServer(oversized, 'transfer-1', '123', 7n)).rejects.toThrow(
      /above the .* limit for browser uploads/s
    );
  });

  it('names the offending file and the limit so the message is actionable', async () => {
    const oversized: File = { name: 'huge.bin', size: 32 * 1024 * 1024 } as unknown as File;
    await expect(uploadFileToServer(oversized, 'transfer-1', '123', 7n)).rejects.toThrow(
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

describe('stagedTransferRef', () => {
  it('is marked as a local reference, not a server path', () => {
    // The service does not hand back a path for an inline upload, so this value
    // exists only to correlate the sender's own records. The `staged:` prefix
    // keeps it from being mistaken for something fetchable — the previous code
    // returned a bare `/transfers/...` string that read exactly like a real path.
    expect(stagedTransferRef('abc', 'notes.md')).toBe('staged:abc/notes.md');
    expect(stagedTransferRef('abc', 'notes.md').startsWith('/')).toBe(false);
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
