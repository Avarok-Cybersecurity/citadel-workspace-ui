import type { InternalServiceResponse } from 'citadel-workspace-client-ts';

/**
 * Utility functions for extracting data from InternalServiceResponse variants.
 *
 * In InternalServiceResponse:
 * - `cid` = LOCAL session CID (recipient of notification)
 * - `peer_cid` = REMOTE peer CID (sender/trigger of notification)
 */

/**
 * Extract the recipient CID (local session) from an InternalServiceResponse.
 * The `cid` field in responses represents the LOCAL session receiving the message.
 *
 * @param response - The InternalServiceResponse object
 * @returns The recipient CID as string, or undefined if not found
 */
export function extractRecipientCid(response: InternalServiceResponse): string | undefined {
  // Response is a tagged union: { VariantName: { cid, peer_cid, ... } }
  for (const key of Object.keys(response)) {
    const inner = (response as any)[key];
    if (inner && typeof inner === 'object' && 'cid' in inner) {
      const cid = inner.cid;
      // cid can be number (u64) or string
      if (cid !== undefined && cid !== null) {
        return typeof cid === 'number' ? cid.toString() : String(cid);
      }
    }
  }
  return undefined;
}

/**
 * Extract the peer CID (remote sender) from an InternalServiceResponse.
 * The `peer_cid` field represents the REMOTE peer who triggered the event.
 *
 * @param response - The InternalServiceResponse object
 * @returns The peer CID as string, or undefined if not found or zero
 */
export function extractPeerCid(response: InternalServiceResponse): string | undefined {
  for (const key of Object.keys(response)) {
    const inner = (response as any)[key];
    if (inner && typeof inner === 'object' && 'peer_cid' in inner) {
      const peerCid = inner.peer_cid;
      // peer_cid of 0 means no peer (not a P2P message)
      if (peerCid !== undefined && peerCid !== null && peerCid !== 0) {
        return typeof peerCid === 'number' ? peerCid.toString() : String(peerCid);
      }
    }
  }
  return undefined;
}

/**
 * Extract both CIDs from a response in one pass.
 *
 * @param response - The InternalServiceResponse object
 * @returns Object with recipientCid and peerCid (both optional)
 */
export function extractCids(response: InternalServiceResponse): {
  recipientCid?: string;
  peerCid?: string;
} {
  for (const key of Object.keys(response)) {
    const inner = (response as any)[key];
    if (inner && typeof inner === 'object') {
      const result: { recipientCid?: string; peerCid?: string } = {};

      if ('cid' in inner && inner.cid !== undefined && inner.cid !== null) {
        result.recipientCid = typeof inner.cid === 'number'
          ? inner.cid.toString()
          : String(inner.cid);
      }

      if ('peer_cid' in inner && inner.peer_cid !== undefined && inner.peer_cid !== null && inner.peer_cid !== 0) {
        result.peerCid = typeof inner.peer_cid === 'number'
          ? inner.peer_cid.toString()
          : String(inner.peer_cid);
      }

      return result;
    }
  }
  return {};
}
