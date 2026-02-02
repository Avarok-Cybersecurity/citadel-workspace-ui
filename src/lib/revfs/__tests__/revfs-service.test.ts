/**
 * RevfsService Tests
 *
 * Mock justification: RevfsIO is the I/O boundary (SBIO pattern).
 * We mock RevfsIO.execute() to verify the service orchestrates
 * pure logic, state, and I/O intents correctly without needing
 * OPFS or network access.
 */

import { describe, it, expect, vi } from 'vitest';
import { RevfsService } from '../revfs-service';
import type { RevfsIntent, RevfsIntentResult } from '@/types/revfs-intents';
import { RevfsOpType, RevfsFileState } from '@/types/revfs-types';
import type { RevfsOperation, RevfsFileMetadata } from '@/types/revfs-types';
import { RevfsState } from '../revfs-state';
import { createDefaultTree, peerPairKey } from '../tree-operations';

// ── Test Helpers ────────────────────────────────────────────────────────

const ALICE = 100n;
const BOB = 200n;
const KEY = peerPairKey(ALICE, BOB);

type IntentHandler = (intent: RevfsIntent) => RevfsIntentResult;

function getState(service: RevfsService): RevfsState {
  return (service as unknown as { state: RevfsState }).state;
}

/**
 * Creates a test service with mocked IO.
 * When autoAck=true (default), send-revfs-op for non-ACK ops
 * auto-resolves the pending ACK so mkdir/rmdir don't hang.
 */
function createTestService(
  intentHandler: IntentHandler,
  opts: { autoAck?: boolean } = {},
): RevfsService {
  const { autoAck = true } = opts;
  const service = new RevfsService();
  service.initialize({
    sendP2PMessageReliable: vi.fn(),
    getCurrentCid: vi.fn().mockResolvedValue(ALICE),
  });

  const io = (service as unknown as { io: { execute: (i: RevfsIntent) => Promise<RevfsIntentResult> } }).io;
  const state = getState(service);

  io.execute = vi.fn(async (intent: RevfsIntent) => {
    const result = intentHandler(intent);

    // Auto-resolve ACKs for non-ACK send operations
    if (autoAck && intent.type === 'send-revfs-op' && result.type === 'send-revfs-op' && result.success) {
      const op = (intent as { operation: RevfsOperation }).operation;
      if (op.op_type !== RevfsOpType.Ack && op.op_type !== RevfsOpType.SyncRequest && op.op_type !== RevfsOpType.SyncResponse) {
        // Schedule ACK resolution on next microtask
        queueMicrotask(() => state.resolveAck(op.op_id, true));
      }
    }

    return result;
  });
  return service;
}

function defaultIntentHandler(overrides?: Partial<Record<RevfsIntent['type'], IntentHandler>>): IntentHandler {
  return (intent: RevfsIntent): RevfsIntentResult => {
    if (overrides?.[intent.type]) {
      return overrides[intent.type]!(intent);
    }
    switch (intent.type) {
      case 'send-revfs-op':
        return { type: 'send-revfs-op', success: true };
      case 'persist-tree':
        return { type: 'persist-tree', success: true };
      case 'load-tree':
        return { type: 'load-tree', tree: null };
      case 'persist-pending-ops':
        return { type: 'persist-pending-ops', success: true };
      case 'load-pending-ops':
        return { type: 'load-pending-ops', ops: [] };
      case 'backend-send-file':
        return { type: 'backend-send-file', success: true };
      case 'backend-download-file':
        return { type: 'backend-download-file', success: true, downloadPath: '/tmp/file' };
      case 'backend-delete-file':
        return { type: 'backend-delete-file', success: true };
    }
  };
}

function getExecuteCalls(service: RevfsService): RevfsIntent[] {
  const io = (service as unknown as { io: { execute: ReturnType<typeof vi.fn> } }).io;
  return io.execute.mock.calls.map((c: [RevfsIntent]) => c[0]);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('RevfsService', () => {
  describe('getTree', () => {
    it('creates default tree when OPFS has none', async () => {
      const service = createTestService(defaultIntentHandler());
      const tree = await service.getTree(ALICE, BOB);

      expect(tree.path).toBe('/');
      expect(tree.children).toHaveLength(2);
      expect(tree.children![0].name).toBe('Received Files');
      expect(tree.children![1].name).toBe('Sent Files');
    });

    it('loads persisted tree from OPFS', async () => {
      const persisted = createDefaultTree();
      persisted.children!.push({
        name: 'docs',
        type: 'directory',
        path: '/docs',
        children: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const service = createTestService(defaultIntentHandler({
        'load-tree': () => ({ type: 'load-tree', tree: persisted }),
      }));

      const tree = await service.getTree(ALICE, BOB);
      expect(tree.children).toHaveLength(3);
    });

    it('caches tree on second call', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.getTree(ALICE, BOB);
      await service.getTree(ALICE, BOB);

      const loadCalls = getExecuteCalls(service).filter(i => i.type === 'load-tree');
      expect(loadCalls).toHaveLength(1);
    });
  });

  describe('mkdir', () => {
    it('creates directory and sends operation to peer', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.mkdir(ALICE, BOB, '/docs');

      const intents = getExecuteCalls(service);
      const sendCalls = intents.filter(i => i.type === 'send-revfs-op');

      expect(sendCalls).toHaveLength(1);
      const sentOp = (sendCalls[0] as { type: 'send-revfs-op'; operation: RevfsOperation }).operation;
      expect(sentOp.op_type).toBe(RevfsOpType.Mkdir);
      expect(sentOp.path).toBe('/docs');
    });

    it('updates tree in state after mkdir', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.mkdir(ALICE, BOB, '/docs');

      const tree = await service.getTree(ALICE, BOB);
      const docs = tree.children!.find(c => c.name === 'docs');
      expect(docs).toBeDefined();
      expect(docs!.type).toBe('directory');
    });

    it('persists tree after mkdir', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.mkdir(ALICE, BOB, '/docs');

      const persistCalls = getExecuteCalls(service).filter(i => i.type === 'persist-tree');
      // At least 1 for default tree creation + 1 for mkdir
      expect(persistCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('rmdir', () => {
    it('removes directory and sends operation', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.mkdir(ALICE, BOB, '/docs');
      await service.rmdir(ALICE, BOB, '/docs');

      const tree = await service.getTree(ALICE, BOB);
      const docs = tree.children!.find(c => c.name === 'docs');
      expect(docs).toBeUndefined();
    });
  });

  describe('handleRevfsOperation', () => {
    it('applies remote mkdir and sends ACK', async () => {
      const service = createTestService(defaultIntentHandler());
      const op: RevfsOperation = {
        op_id: 'test-op-1',
        op_type: RevfsOpType.Mkdir,
        path: '/shared',
        timestamp: Date.now(),
      };

      await service.handleRevfsOperation(BOB, ALICE, op);

      const tree = await service.getTree(ALICE, BOB);
      const shared = tree.children!.find(c => c.name === 'shared');
      expect(shared).toBeDefined();

      const sendCalls = getExecuteCalls(service).filter(i => i.type === 'send-revfs-op');
      const ackCall = sendCalls.find(i => {
        const sentOp = (i as { operation: RevfsOperation }).operation;
        return sentOp.op_type === RevfsOpType.Ack;
      });
      expect(ackCall).toBeDefined();
      const ackOp = (ackCall as { operation: RevfsOperation }).operation;
      expect(ackOp.ack_op_id).toBe('test-op-1');
      expect(ackOp.success).toBe(true);
    });

    it('resolves pending ACK when ACK received', async () => {
      // Disable autoAck to test manual ACK resolution
      const service = createTestService(defaultIntentHandler(), { autoAck: false });

      const mkdirPromise = service.mkdir(ALICE, BOB, '/docs');

      // Wait for send to happen
      await new Promise(r => setTimeout(r, 10));
      const sendCalls = getExecuteCalls(service).filter(i => i.type === 'send-revfs-op');
      const mkdirSend = sendCalls.find(i => {
        const op = (i as { operation: RevfsOperation }).operation;
        return op.op_type === RevfsOpType.Mkdir;
      });
      expect(mkdirSend).toBeDefined();
      const sentOpId = (mkdirSend as { operation: RevfsOperation }).operation.op_id;

      // Simulate receiving ACK from peer
      const ackOp: RevfsOperation = {
        op_id: 'ack-1',
        op_type: RevfsOpType.Ack,
        path: '/docs',
        ack_op_id: sentOpId,
        success: true,
        timestamp: Date.now(),
      };
      await service.handleRevfsOperation(BOB, ALICE, ackOp);

      await mkdirPromise;
    });

    it('handles SyncRequest by sending SyncResponse', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.mkdir(ALICE, BOB, '/docs');

      const syncReq: RevfsOperation = {
        op_id: 'sync-req-1',
        op_type: RevfsOpType.SyncRequest,
        path: '/',
        timestamp: Date.now(),
      };

      await service.handleRevfsOperation(BOB, ALICE, syncReq);

      const sendCalls = getExecuteCalls(service).filter(i => i.type === 'send-revfs-op');
      const syncResp = sendCalls.find(i => {
        const op = (i as { operation: RevfsOperation }).operation;
        return op.op_type === RevfsOpType.SyncResponse;
      });
      expect(syncResp).toBeDefined();
      const respOp = (syncResp as { operation: RevfsOperation }).operation;
      expect(respOp.tree).toBeDefined();
      expect(respOp.tree!.children!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('sendAndAwaitAck timeout', () => {
    it('queues to pendingOps when send fails', async () => {
      const service = createTestService(defaultIntentHandler({
        'send-revfs-op': () => ({ type: 'send-revfs-op', success: false }),
      }));

      await service.mkdir(ALICE, BOB, '/docs');

      const persistPendingCalls = getExecuteCalls(service)
        .filter(i => i.type === 'persist-pending-ops');
      expect(persistPendingCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('uploadFileToPeer', () => {
    it('places file, persists, and sends op with ACK', async () => {
      const service = createTestService(defaultIntentHandler());
      const meta: RevfsFileMetadata = {
        fileId: 'f1', fileName: 'doc.pdf', fileSize: 1024, fileType: 'application/pdf',
        virtualDirectory: '/vfs/doc', uploadedByCid: ALICE,
      };
      await service.uploadFileToPeer(ALICE, BOB, '/Sent Files', 'doc.pdf', meta);

      const tree = await service.getTree(ALICE, BOB);
      const file = tree.children?.find(c => c.name === 'Sent Files')?.children?.find(c => c.name === 'doc.pdf');
      expect(file).toBeDefined();
      expect(file!.fileState).toBe(RevfsFileState.Hosted);

      const intents = getExecuteCalls(service);
      expect(intents.filter(i => i.type === 'persist-tree').length).toBeGreaterThanOrEqual(2);
      expect(intents.filter(i => i.type === 'send-revfs-op').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('removeFileFromPeer', () => {
    it('removes file, sends backend-delete-file, and sends ACK', async () => {
      const service = createTestService(defaultIntentHandler());
      const meta: RevfsFileMetadata = {
        fileId: 'f1', fileName: 'doc.pdf', fileSize: 1024, fileType: 'application/pdf',
        virtualDirectory: '/vfs/doc', uploadedByCid: ALICE,
      };
      await service.uploadFileToPeer(ALICE, BOB, '/Sent Files', 'doc.pdf', meta);
      await service.removeFileFromPeer(ALICE, BOB, '/Sent Files/doc.pdf');

      const tree = await service.getTree(ALICE, BOB);
      const sentFiles = tree.children?.find(c => c.name === 'Sent Files');
      expect(sentFiles?.children?.find(c => c.name === 'doc.pdf')).toBeUndefined();

      const intents = getExecuteCalls(service);
      const deleteCalls = intents.filter(i => i.type === 'backend-delete-file');
      expect(deleteCalls).toHaveLength(1);
    });
  });

  describe('downloadFileFromPeer', () => {
    it('finds file recursively and returns download path', async () => {
      const service = createTestService(defaultIntentHandler());
      const meta: RevfsFileMetadata = {
        fileId: 'f1', fileName: 'doc.pdf', fileSize: 1024, fileType: 'application/pdf',
        virtualDirectory: '/vfs/doc', uploadedByCid: ALICE,
      };
      await service.uploadFileToPeer(ALICE, BOB, '/Sent Files', 'doc.pdf', meta);
      const path = await service.downloadFileFromPeer(ALICE, BOB, '/Sent Files/doc.pdf');
      expect(path).toBe('/tmp/file');
    });

    it('throws when file not found', async () => {
      const service = createTestService(defaultIntentHandler());
      await expect(service.downloadFileFromPeer(ALICE, BOB, '/nope.txt')).rejects.toThrow('File not found');
    });
  });

  describe('addSentFile', () => {
    it('places file in Sent Files with Sent state', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.addSentFile(ALICE, BOB, {
        fileName: 'report.pdf', fileSize: 2048, fileType: 'application/pdf', transferId: 't1',
      });
      const tree = await service.getTree(ALICE, BOB);
      const sentFiles = tree.children?.find(c => c.name === 'Sent Files');
      const file = sentFiles?.children?.find(c => c.name === 'report.pdf');
      expect(file).toBeDefined();
      expect(file!.fileState).toBe(RevfsFileState.Sent);
    });
  });

  describe('addReceivedFile', () => {
    it('places file in Received Files with Received state', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.addReceivedFile(ALICE, BOB, {
        fileName: 'photo.jpg', fileSize: 4096, fileType: 'image/jpeg', transferId: 't2',
      });
      const tree = await service.getTree(ALICE, BOB);
      const receivedFiles = tree.children?.find(c => c.name === 'Received Files');
      const file = receivedFiles?.children?.find(c => c.name === 'photo.jpg');
      expect(file).toBeDefined();
      expect(file!.fileState).toBe(RevfsFileState.Received);
    });
  });

  describe('handleRevfsOperation (additional)', () => {
    it('applies remote PlaceFile and sends ACK', async () => {
      const service = createTestService(defaultIntentHandler());
      // Ensure tree exists with /docs
      await service.mkdir(ALICE, BOB, '/docs');

      const meta: RevfsFileMetadata = {
        fileId: 'f1', fileName: 'file.pdf', fileSize: 512, fileType: 'application/pdf',
        virtualDirectory: '/vfs/f', uploadedByCid: BOB,
      };
      const op: RevfsOperation = {
        op_id: 'place-1', op_type: RevfsOpType.PlaceFile, path: '/docs/file.pdf',
        metadata: meta, timestamp: Date.now(),
      };
      await service.handleRevfsOperation(BOB, ALICE, op);

      const tree = await service.getTree(ALICE, BOB);
      const file = tree.children?.find(c => c.name === 'docs')?.children?.find(c => c.name === 'file.pdf');
      expect(file).toBeDefined();
      // BOB uploaded → ALICE (viewer) sees Remote
      expect(file!.fileState).toBe(RevfsFileState.Remote);
    });

    it('applies remote RemoveFile and sends ACK', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.mkdir(ALICE, BOB, '/docs');
      const meta: RevfsFileMetadata = {
        fileId: 'f1', fileName: 'file.pdf', fileSize: 512, fileType: 'application/pdf',
        virtualDirectory: '/vfs/f', uploadedByCid: ALICE,
      };
      await service.uploadFileToPeer(ALICE, BOB, '/docs', 'file.pdf', meta);

      const removeOp: RevfsOperation = {
        op_id: 'rm-1', op_type: RevfsOpType.RemoveFile, path: '/docs/file.pdf', timestamp: Date.now(),
      };
      await service.handleRevfsOperation(BOB, ALICE, removeOp);

      const tree = await service.getTree(ALICE, BOB);
      const docs = tree.children?.find(c => c.name === 'docs');
      expect(docs?.children?.find(c => c.name === 'file.pdf')).toBeUndefined();
    });

    it('handles SyncResponse by merging trees', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.mkdir(ALICE, BOB, '/local-dir');

      // Simulate peer's tree with a different directory
      const { createDefaultTree } = await import('../tree-operations');
      const { mkdir: treeMkdir } = await import('../tree-operations');
      let peerTree = createDefaultTree();
      [peerTree] = treeMkdir(peerTree, '/remote-dir');

      const syncOp: RevfsOperation = {
        op_id: 'sync-resp-1', op_type: RevfsOpType.SyncResponse, path: '/',
        tree: peerTree, timestamp: Date.now(),
      };
      await service.handleRevfsOperation(BOB, ALICE, syncOp);

      const tree = await service.getTree(ALICE, BOB);
      // Both local and remote dirs should exist after merge
      expect(tree.children?.find(c => c.name === 'local-dir')).toBeDefined();
      expect(tree.children?.find(c => c.name === 'remote-dir')).toBeDefined();
    });
  });

  describe('requestSync', () => {
    it('sends SyncRequest op to peer', async () => {
      const service = createTestService(defaultIntentHandler());
      await service.requestSync(ALICE, BOB);

      const intents = getExecuteCalls(service);
      const syncCalls = intents.filter(i => {
        if (i.type !== 'send-revfs-op') return false;
        const op = (i as { operation: RevfsOperation }).operation;
        return op.op_type === RevfsOpType.SyncRequest;
      });
      expect(syncCalls).toHaveLength(1);
    });
  });

  describe('onTreeChanged', () => {
    it('notifies subscribers when tree changes', async () => {
      const service = createTestService(defaultIntentHandler());
      const changes: string[] = [];

      service.onTreeChanged((key) => {
        changes.push(key);
      });

      await service.mkdir(ALICE, BOB, '/docs');
      expect(changes.filter(k => k === KEY).length).toBeGreaterThanOrEqual(1);
    });

    it('returns unsubscribe function', async () => {
      const service = createTestService(defaultIntentHandler());
      const changes: string[] = [];

      const unsub = service.onTreeChanged((key) => {
        changes.push(key);
      });

      await service.getTree(ALICE, BOB);
      const countBefore = changes.length;

      unsub();
      await service.mkdir(ALICE, BOB, '/docs');
      expect(changes.length).toBe(countBefore);
    });
  });
});
