/**
 * Parsing FileTransferTickNotification into transfer progress/outcome events.
 *
 * The wire gives a tick stream almost nothing to correlate on: TransferTick /
 * ReceptionTick are `[group, total_groups, Mb/s]` tuples and the completes are
 * bare strings — none of them carry an object id. What identifies a stream is
 * its ENVELOPE: `cid` (our session), `peer_cid` (the other side) and
 * `request_id`, which the internal service sets to
 *
 *   - the RespondFileTransfer request UUID for a stream we accepted
 *     (recipient side) — unique per transfer, and
 *   - the localhost TCP connection UUID for a stream we initiated
 *     (sender side; `spawn_tick_updater` is called with `None` there) —
 *     shared by every outgoing stream in the browser, so useless as an id.
 *
 * So correlation is layered:
 *   1. `ReceptionBeginning(path, metadata)` DOES carry `metadata.object_id`;
 *      the offer correlator has already joined object_id -> transferId, and we
 *      extend that join to the stream's request_id here, so the id-less ticks
 *      and completes that follow resolve exactly.
 *   2. Sender-side events resolve to no transferId here; the service falls
 *      back to matching the active outgoing transfer for (cid, peer_cid) —
 *      see protocol-transfer-events.ts, which also documents the wire
 *      limitation that makes two concurrent sends to one peer ambiguous.
 *
 * RE-VFS uses the same notification type. A revfs pull's stream is recognised
 * at ReceptionBeginning by `metadata.transfer_type !== 'FileTransfer'` and its
 * request_id is remembered as foreign so the stream's later incoming ticks and
 * completes are dropped instead of being pinned on an unrelated chat transfer.
 */

import { isVariant } from 'citadel-workspace-client-ts';
import type { FileTransferTickNotification } from './protocol-types';

export type TickDirection = 'outgoing' | 'incoming' | 'unknown';

/** Correlation state owned by the router, threaded into every parse. */
export interface TickCorrelation {
  /** object_id -> transferId, populated by the protocol-offer correlator. */
  objectIdToTransferId: Map<string, string>;
  /** tick-stream request_id -> transferId, learned at accept / ReceptionBeginning. */
  requestIdToTransferId: Map<string, string>;
  /** tick-stream request_id -> local download path from ReceptionBeginning. */
  requestIdToDownloadPath: Map<string, string>;
  /** request_ids of streams that are NOT chat transfers (revfs), to drop. */
  foreignRequestIds: Set<string>;
}

export interface ParsedTickProgress {
  kind: 'progress';
  direction: 'outgoing' | 'incoming';
  transferId?: string;
  cid: bigint;
  peerCid: bigint;
  /**
   * Group counts, not bytes: the wire reports `[group, total_groups]`, so the
   * only byte-accurate figure a tick yields is the percentage. Totals in bytes
   * come from ReceptionBeginning's metadata when available.
   */
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  status: 'uploading' | 'downloading';
}

export interface ParsedTickComplete {
  kind: 'complete';
  direction: TickDirection;
  transferId?: string;
  cid: bigint;
  peerCid: bigint;
  success: boolean;
  downloadPath?: string;
  errorMessage?: string;
}

export type ParsedTick = ParsedTickProgress | ParsedTickComplete | null;

function percentage(group: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((group / total) * 100)) : 0;
}

/**
 * Parse one tick notification against the correlation state, registering any
 * new joins it reveals (ReceptionBeginning) as a side effect.
 */
export function parseTickNotification(
  notification: FileTransferTickNotification,
  ctx: TickCorrelation
): ParsedTick {
  const { status, cid } = notification;
  const peerCid: bigint | null = notification.peer_cid;
  const requestId: string | undefined = notification.request_id ?? undefined;

  // No peer means a C2S transfer (server storage), which is not a chat
  // transfer and has nothing in our state to update.
  if (peerCid === null || peerCid === undefined) return null;

  const resolved: string | undefined = requestId ? ctx.requestIdToTransferId.get(requestId) : undefined;
  const isForeign = requestId !== undefined && ctx.foreignRequestIds.has(requestId);

  if (status === 'TransferBeginning') {
    return {
      kind: 'progress', direction: 'outgoing', transferId: resolved,
      cid, peerCid, bytesTransferred: 0, totalBytes: 0, percentage: 0,
      status: 'uploading',
    };
  }

  if (isVariant(status, 'ReceptionBeginning')) {
    const [downloadPath, metadata] = status.ReceptionBeginning;
    if (metadata.transfer_type !== 'FileTransfer') {
      // A revfs stream. Remember its request_id so the id-less ticks and
      // completes that follow are dropped rather than matched by peer-pair
      // against an unrelated chat transfer.
      if (requestId) ctx.foreignRequestIds.add(requestId);
      return null;
    }
    const objectId: string = metadata.object_id.toString();
    const transferId: string | undefined = ctx.objectIdToTransferId.get(objectId) ?? resolved;
    if (requestId) {
      if (transferId) ctx.requestIdToTransferId.set(requestId, transferId);
      ctx.requestIdToDownloadPath.set(requestId, downloadPath);
    }
    return {
      kind: 'progress', direction: 'incoming', transferId,
      cid, peerCid, bytesTransferred: 0,
      totalBytes: Number(metadata.plaintext_length), percentage: 0,
      status: 'downloading',
    };
  }

  if (isVariant(status, 'TransferTick')) {
    const [group, total] = status.TransferTick;
    return {
      kind: 'progress', direction: 'outgoing', transferId: resolved,
      cid, peerCid, bytesTransferred: group, totalBytes: total,
      percentage: percentage(group, total), status: 'uploading',
    };
  }

  if (isVariant(status, 'ReceptionTick')) {
    if (isForeign) return null;
    const [group, total] = status.ReceptionTick;
    return {
      kind: 'progress', direction: 'incoming', transferId: resolved,
      cid, peerCid, bytesTransferred: group, totalBytes: total,
      percentage: percentage(group, total), status: 'downloading',
    };
  }

  if (status === 'TransferComplete') {
    return {
      kind: 'complete', direction: 'outgoing', transferId: resolved,
      cid, peerCid, success: true,
    };
  }

  if (status === 'ReceptionComplete') {
    if (isForeign) return null;
    return {
      kind: 'complete', direction: 'incoming', transferId: resolved,
      cid, peerCid, success: true,
      downloadPath: requestId ? ctx.requestIdToDownloadPath.get(requestId) : undefined,
    };
  }

  if (isVariant(status, 'Fail')) {
    if (isForeign) return null;
    return {
      kind: 'complete', direction: 'unknown', transferId: resolved,
      cid, peerCid, success: false, errorMessage: status.Fail,
    };
  }

  return null;
}
