/**
 * Presence, and the two lies it replaced.
 *
 * The green dot was `Math.random() > 0.5`, then
 * `connectionService.canMessageUser`, which reads a map keyed on the literal
 * `'current-user'` that only the demo simulation writes — so it answered false
 * for everyone, forever, while looking like a real service call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const isPeerOnline = vi.fn<(cid: bigint) => boolean>();

// The polled registry is the thing under test's one dependency, and it holds a
// timer and a WebSocket. Stubbing it is what keeps this a unit test; the values
// it returns are the real shape (bigint CIDs) so the parsing is not faked away.
vi.mock('../p2p-auto-connect-service', () => ({
  p2pAutoConnectService: {
    isPeerOnline: (cid: bigint) => isPeerOnline(cid),
  },
}));

const { isMemberOnline, memberIdToCid } = await import('../presence');

describe('member presence', () => {
  beforeEach(() => {
    isPeerOnline.mockReset();
  });

  it('asks the registry about the member, by CID', () => {
    isPeerOnline.mockReturnValue(true);

    expect(isMemberOnline('12345')).toBe(true);
    expect(isPeerOnline).toHaveBeenCalledWith(12345n);
  });

  it('reports offline when the registry says so', () => {
    isPeerOnline.mockReturnValue(false);
    expect(isMemberOnline('12345')).toBe(false);
  });

  it('does not answer the same for everyone', () => {
    // The defect this replaced was constant-false. A presence function that
    // cannot differ between two members is not presence.
    isPeerOnline.mockImplementation((cid) => cid === 1n);

    expect(isMemberOnline('1')).toBe(true);
    expect(isMemberOnline('2')).toBe(false);
  });

  it('treats a member id that is not a CID as offline, without throwing', () => {
    // BigInt('alice') throws. Member ids come off the wire and the mapping
    // layer accepts any non-empty value, so this is reachable.
    for (const id of ['alice', '', ' 12 ', '12.5', '-3', 'NaN']) {
      expect(() => isMemberOnline(id), id).not.toThrow();
      expect(isMemberOnline(id), id).toBe(false);
    }
    expect(isPeerOnline).not.toHaveBeenCalled();
  });

  it('parses a CID id and rejects the rest', () => {
    expect(memberIdToCid('9007199254740993')).toBe(9007199254740993n);
    expect(memberIdToCid('alice')).toBeNull();
  });
});
