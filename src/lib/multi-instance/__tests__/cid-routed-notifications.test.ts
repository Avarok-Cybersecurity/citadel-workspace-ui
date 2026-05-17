import { describe, it, expect } from 'vitest';

/**
 * Tests pinning CID extraction for every notification type listed in
 * `CID_ROUTED_NOTIFICATIONS`. The router's correctness hinges on
 * `extractTargetCid` finding a CID for each of these notification
 * shapes — if it returns `null`, the router falls through to its
 * self-heal path and the message is processed on the leader tab
 * instead of being forwarded to the owning follower.
 *
 * The three new File-Transfer entries (`FileTransferRequestNotification`,
 * `FileTransferStatusNotification`, `FileTransferTickNotification`)
 * were added to `CID_ROUTED_NOTIFICATIONS` to stop the leader from
 * broadcasting file-transfer prompts to unrelated tabs (see
 * citadel-internal-service round-2 P-B fix in PR #55). Without these
 * tests, a future shape change (e.g. nesting the cid under a different
 * key, or renaming the field) would silently downgrade the file
 * transfer flow to leader-tab-only delivery.
 */

import {
  CID_ROUTED_NOTIFICATIONS,
} from '../routing-rules';
import { extractTargetCid } from '../message-routing';

const targetCid = '1281805798482117626';
const senderCid = '18170202856123884154';

function notification(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { [type]: payload };
}

describe('CID_ROUTED_NOTIFICATIONS — every entry has extractable CID', () => {
  // Build the canonical message shape for each notification type so the
  // router can find `cid` at the expected location. If a new entry is
  // added to `CID_ROUTED_NOTIFICATIONS` without a corresponding shape
  // here, the loop test below will fail and force the author to add
  // coverage.
  const SHAPES: Record<string, Record<string, unknown>> = {
    PeerRegisterNotification: { cid: targetCid, peer_cid: senderCid, peer_username: 'alice', request_id: 'r1' },
    PeerConnectNotification: { cid: targetCid, peer_cid: senderCid, request_id: 'r2' },
    MessageNotification: { cid: targetCid, peer_cid: senderCid, message: [1, 2, 3], request_id: 'r3' },
    FileTransferRequestNotification: { cid: targetCid, peer_cid: senderCid, metadata: { object_id: '42' }, request_id: 'r4' },
    FileTransferStatusNotification: { cid: targetCid, peer_cid: senderCid, status: 'in-progress', request_id: 'r5' },
    FileTransferTickNotification: { cid: targetCid, peer_cid: senderCid, transmitted_bytes: 1024, request_id: 'r6' },
  };

  it('has a test fixture for every CID-routed notification type', () => {
    // Adding to CID_ROUTED_NOTIFICATIONS without adding a SHAPES entry
    // fails the next assertion loudly — the actual extraction tests
    // below would only fire for shapes I happened to know about.
    for (const type of CID_ROUTED_NOTIFICATIONS) {
      expect(SHAPES, `missing fixture for ${type}`).toHaveProperty(type);
    }
  });

  for (const type of Object.keys(SHAPES)) {
    it(`extracts target cid from ${type}`, () => {
      const msg = notification(type, SHAPES[type]);
      const extracted = extractTargetCid(msg);
      expect(extracted, `${type} should yield the recipient cid`).toBe(targetCid);
    });
  }

  it('extracts the nested cid even when the field also appears at the top level', () => {
    // Defensive: some pipelines wrap notifications with a top-level
    // `cid` AND a payload `cid`. The router checks top-level first, so
    // pin that precedence too.
    const otherCid = '9999999999999999999';
    const msg = { cid: otherCid, FileTransferRequestNotification: SHAPES.FileTransferRequestNotification };
    expect(extractTargetCid(msg)).toBe(otherCid);
  });

  it('falls back to peer_cid when cid is missing (documented secondary id)', () => {
    // `CID_FIELDS = ['cid', 'peer_cid', 'session_cid']` — `extractTargetCid`
    // walks the list in order. Pinning this so a future "tighten extraction
    // to cid-only" change has to remove the fallback explicitly rather than
    // by accident.
    const msg = notification('FileTransferRequestNotification', { peer_cid: senderCid, metadata: { object_id: '42' } });
    expect(extractTargetCid(msg)).toBe(senderCid);
  });

  it('returns null when no cid-like field is present anywhere', () => {
    // Required for the self-heal trigger path — extractTargetCid must
    // return null (not undefined or empty string) so the router's
    // `if (!targetCid)` branch reliably fires.
    const msg = notification('FileTransferRequestNotification', { metadata: { object_id: '42' }, request_id: 'r-no-cid' });
    expect(extractTargetCid(msg)).toBeNull();
  });
});
