/**
 * `src/lib/file-transfer/protocol-types.ts` hand-writes `ObjectTransferStatus`
 * instead of importing the generated one, so tsc validates the whole tick parser
 * against a shape the wire never produces. Every variant disagrees with
 * @avarok/citadel-protocol-types, which is generated from the Rust enum:
 *
 *   local (fiction)                        canonical (generated)
 *   { ReceptionTick: {object_id,           { ReceptionTick: [number,number,number] }
 *                     received, total} }
 *   { ReceptionComplete: { object_id } }   "ReceptionComplete"   (bare string)
 *   { TransferComplete: { object_id } }    "TransferComplete"    (bare string)
 *   { Fail: { object_id, message } }       { Fail: string }
 *
 * The consequence is bigger than a parsing bug: the real tick carries NO object
 * id, so the objectId -> transferId correlation the whole stack is built on
 * cannot be satisfied from these notifications at all.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCompleteHandler, parseTickStatus } from '../receive-operations';
import { applyTransferOutcome } from '../transfer-outcome';
import type { ObjectTransferStatus } from '../protocol-types';
import type { FileTransfer } from '../types';
import type { P2PTransferDeps } from '../p2p-transfers';

/** Exactly what the internal service sends, per the generated type. */
const CANONICAL_RECEPTION_TICK = { ReceptionTick: [1, 2, 50] } as unknown as ObjectTransferStatus;
const CANONICAL_RECEPTION_COMPLETE = 'ReceptionComplete' as unknown as ObjectTransferStatus;

describe('the tick parser vs the real wire shape', () => {
  it.fails('BUG: parses a canonical ReceptionTick — it reads object_id/received/total that do not exist', () => {
    const parsed = parseTickStatus(CANONICAL_RECEPTION_TICK);
    expect(parsed?.percentage).toBe(50);
  });

  it.fails('BUG: recognises a canonical ReceptionComplete — a bare string, not an object', () => {
    const seen: string[] = [];
    const handler = createCompleteHandler((e) => seen.push(e.transferId), new Map());
    handler({ FileTransferTickNotification: { status: CANONICAL_RECEPTION_COMPLETE } });
    expect(seen).toHaveLength(1);
  });

  it('parses only the fictional local shape, which is why the path was never subscribed', () => {
    const parsed = parseTickStatus({
      ReceptionTick: { object_id: 5n, received: 50n, total: 100n },
    } as ObjectTransferStatus);
    expect(parsed?.percentage).toBe(50);
  });
});

const transfer = (over: Partial<FileTransfer> = {}): FileTransfer =>
  ({ id: 't1', state: 'transferring', progress: 0, updatedAt: 0, ...over }) as FileTransfer;

function depsFor(t: FileTransfer) {
  const saveTransfer = vi.fn(async () => {});
  const emitStateChange = vi.fn();
  return {
    deps: {
      state: { getTransfer: (id: string) => (id === t.id ? t : undefined) },
      saveTransfer,
      emitStateChange,
    } as unknown as P2PTransferDeps,
    saveTransfer,
    emitStateChange,
  };
}

describe('applyTransferOutcome', () => {
  it('moves a transferring file to complete and persists it', async () => {
    const t = transfer();
    const { deps, saveTransfer, emitStateChange } = depsFor(t);

    await applyTransferOutcome(deps, 't1', { success: true, downloadPath: '/dl/a.pdf' });

    expect(t.state).toBe('complete');
    expect(t.progress).toBe(100);
    expect(saveTransfer).toHaveBeenCalledOnce();
    expect(emitStateChange).toHaveBeenCalledOnce();
  });

  it('is a no-op once terminal, so two planes cannot double-report one transfer', async () => {
    const t = transfer({ state: 'complete', downloadPath: '/dl/a.pdf' });
    const { deps, saveTransfer, emitStateChange } = depsFor(t);

    await applyTransferOutcome(deps, 't1', { success: false, errorMessage: 'late failure' });

    expect(t.state).toBe('complete');
    expect(t.downloadPath).toBe('/dl/a.pdf');
    expect(saveTransfer).not.toHaveBeenCalled();
    expect(emitStateChange).not.toHaveBeenCalled();
  });
});
