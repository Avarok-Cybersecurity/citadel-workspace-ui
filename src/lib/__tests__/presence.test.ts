/**
 * Presence, and the four ways this dot has been wrong.
 *
 *   1. Math.random() — a coin flip.
 *   2. A demo-only map — constant false, while naming a real-sounding service.
 *   3. This module's first version — it parsed the member id as a CID. Member
 *      ids are USERNAMES (the kernel sets user_id from get_username_by_cid),
 *      so the numeric guard rejected every real id and it went straight back to
 *      constant false. The file's own comment asserted the wrong thing.
 *   4. UserDirectory answering "is this person registered with me" under a
 *      green dot, so a registered-but-offline peer showed as online.
 *
 * The fixture below is a USERNAME, deliberately: version 3 passed every test it
 * had, because every test used a numeric id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const isPeerOnline = vi.fn<(cid: bigint) => boolean>();
const getPeers = vi.fn();

vi.mock('../p2p-auto-connect-service', () => ({
  p2pAutoConnectService: { isPeerOnline: (cid: bigint): boolean => isPeerOnline(cid) },
}));
vi.mock('../p2p-registration-service', () => ({
  p2pRegistrationService: { getPeers: (): unknown => getPeers() },
}));

const { isMemberOnline, memberIdToCid } = await import('../presence');

const peer: (username: string, cid: bigint, isOnline?: boolean) => { cid: bigint; username: string; fullName: string; isOnline: boolean; isRegistered: boolean; } = (username: string, cid: bigint, isOnline = false): { cid: bigint; username: string; fullName: string; isOnline: boolean; isRegistered: boolean; } => ({
  cid,
  username,
  fullName: '',
  isOnline,
  isRegistered: true,
});

describe('member presence', () => {
  beforeEach(() => {
    isPeerOnline.mockReset().mockReturnValue(false);
    getPeers.mockReset().mockReturnValue({ allPeers: [], registeredPeers: [] });
  });

  it('finds a member by username, which is what a member id is', () => {
    getPeers.mockReturnValue({ allPeers: [peer('alice', 42n)], registeredPeers: [] });
    isPeerOnline.mockImplementation((cid) => cid === 42n);

    expect(isMemberOnline('alice')).toBe(true);
    expect(isPeerOnline).toHaveBeenCalledWith(42n);
  });

  it('does not answer the same for everyone', () => {
    // A presence function that cannot differ between two members is not
    // presence — which is exactly what versions 2 and 3 were.
    getPeers.mockReturnValue({
      allPeers: [peer('alice', 1n), peer('bob', 2n)],
      registeredPeers: [],
    });
    isPeerOnline.mockImplementation((cid) => cid === 1n);

    expect(isMemberOnline('alice')).toBe(true);
    expect(isMemberOnline('bob')).toBe(false);
  });

  it('falls back to the registry snapshot when the poll has not seen them', () => {
    getPeers.mockReturnValue({ allPeers: [peer('alice', 42n, true)], registeredPeers: [] });
    isPeerOnline.mockReturnValue(false);

    expect(isMemberOnline('alice')).toBe(true);
  });

  it('prefers a username match over a CID match for a numeric username', () => {
    // Nothing forbids a numeric username, and reading one as somebody else's
    // CID would be a fifth version of this bug.
    getPeers.mockReturnValue({
      allPeers: [peer('7', 99n), peer('carol', 7n)],
      registeredPeers: [],
    });
    isPeerOnline.mockImplementation((cid) => cid === 99n);

    expect(isMemberOnline('7')).toBe(true);
  });

  it('reports offline for a member the registry has never heard of', () => {
    getPeers.mockReturnValue({ allPeers: [], registeredPeers: [] });

    expect(isMemberOnline('stranger')).toBe(false);
    expect(isPeerOnline).not.toHaveBeenCalled();
  });

  it('does not throw on any shape of member id', () => {
    getPeers.mockReturnValue({ allPeers: [], registeredPeers: [] });

    for (const id of ['', ' ', 'alice', '12', '-3', 'NaN', '12.5']) {
      expect(() => isMemberOnline(id), id).not.toThrow();
    }
  });

  it('still recognises a CID when one is passed', () => {
    expect(memberIdToCid('9007199254740993')).toBe(9007199254740993n);
    expect(memberIdToCid('alice')).toBeNull();
  });
});
