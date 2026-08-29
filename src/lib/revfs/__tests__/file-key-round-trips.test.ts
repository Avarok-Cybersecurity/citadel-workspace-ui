/**
 * Upload, download and delete must address a file by the SAME key.
 *
 * Upload writes `virtual_path = <full file path>`. Download and delete sent
 * `fileMetadata.virtualDirectory` — the containing DIRECTORY — so a file at
 * `/docs/notes.txt` was written under `/docs/notes.txt` and read back under
 * `/docs`. Two different keys for one object: downloads miss, deletes miss, and
 * the bytes become unreferenceable while still consuming storage.
 *
 * Deriving from the path also ends a drift the stored field could not avoid:
 * rename and move rewrite `node.path` and never touch `virtualDirectory`, so
 * the stored key grew staler with every rename.
 *
 * Asserted on the INTENTS the file operations emit, because that is where the
 * key is chosen. An earlier version of this test called the network functions
 * directly with a path and asserted they passed it through — which they always
 * did. It passed with the bug fully restored.
 */
import { describe, it, expect } from 'vitest';
import { createTestService, ALICE } from './revfs-service-test-helpers';
import type { RevfsIntent, RevfsIntentResult } from '@/types/revfs-intents';
import type { RevfsService } from '@/lib/revfs/revfs-service';

const FILE_PATH: string = '/notes.txt';

/** Run `act` against a real service, returning every intent it emitted. */
async function intentsFrom(
  act: (service: ReturnType<typeof createTestService>) => Promise<unknown>
): Promise<RevfsIntent[]> {
  const seen: RevfsIntent[] = [];
  const service: RevfsService = createTestService((intent): RevfsIntentResult => {
    seen.push(intent);
    switch (intent.type) {
      case 'backend-send-file':
        return { type: 'backend-send-file', success: true };
      case 'backend-download-file':
        return { type: 'backend-download-file', success: true, downloadPath: '/tmp/f' };
      case 'backend-delete-file':
        return { type: 'backend-delete-file', success: true };
      case 'load-tree':
        return { type: 'load-tree', tree: null };
      case 'load-pending-ops':
        return { type: 'load-pending-ops', ops: [] };
      default:
        return { type: intent.type, success: true } as RevfsIntentResult;
    }
  });
  await act(service);
  return seen;
}

/** The key a backend intent addresses the file by. */
const keyOf = (intent: RevfsIntent): string | undefined =>
  'virtualDir' in intent ? (intent.virtualDir as string) : undefined;

describe('the key a file is addressed by', () => {
  it('is the file path on upload, download and delete alike', async () => {
    const metadata: { fileId: string; fileName: string; fileSize: number; fileType: string; virtualDirectory: string; uploadedByCid: bigint; } = {
      fileId: 'f1',
      fileName: 'notes.txt',
      fileSize: 1,
      fileType: 'text/plain',
      // Deliberately the CONTAINING DIRECTORY, which is what the UI stores and
      // what download/delete used to send.
      virtualDirectory: '/',
      uploadedByCid: ALICE,
    };

    const intents: RevfsIntent[] = await intentsFrom(async (service) => {
      await service.uploadFileToServer(ALICE, '/', 'notes.txt', metadata, new Uint8Array([1]));
      await service.downloadFileFromServer(ALICE, FILE_PATH);
      await service.removeFileFromServer(ALICE, FILE_PATH);
    });

    const backendKeys: (string | undefined)[] = intents
      .filter((i) => i.type.startsWith('backend-'))
      .map(keyOf);

    expect(backendKeys.length, 'all three operations should reach the backend').toBe(3);
    for (const key of backendKeys) expect(key).toBe(FILE_PATH);
  });

  it('keeps addressing the ORIGINAL key after a rename', async () => {
    const metadata: { fileId: string; fileName: string; fileSize: number; fileType: string; virtualDirectory: string; uploadedByCid: bigint; } = {
      fileId: 'f1',
      fileName: 'notes.txt',
      fileSize: 1,
      fileType: 'text/plain',
      virtualDirectory: '/',
      uploadedByCid: ALICE,
    };

    const intents: RevfsIntent[] = await intentsFrom(async (service) => {
      await service.uploadFileToServer(ALICE, '/', 'notes.txt', metadata, new Uint8Array([1]));
      await service.serverRename(ALICE, FILE_PATH, 'renamed.txt');
      await service.downloadFileFromServer(ALICE, '/renamed.txt');
    });

    const backendKeys: (string | undefined)[] = intents.filter((i) => i.type.startsWith('backend-')).map(keyOf);

    // The backend has send/download/delete and NO way to re-path an object, so
    // a rename cannot move the bytes. Deriving the key from the current
    // node.path — which an earlier version of this fix did — would ask for
    // '/renamed.txt' and miss every renamed file. The upload-time key is the
    // one the bytes actually live under.
    expect(backendKeys).toEqual([FILE_PATH, FILE_PATH]);
  });
});
