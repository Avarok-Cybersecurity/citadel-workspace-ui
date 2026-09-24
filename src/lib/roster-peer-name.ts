import { p2pRegistrationService } from '@/lib/p2p-registration-service';
import { peerDisplayName } from '@/lib/peer-display';

/**
 * The name to show for a peer that the wire identified only by CID.
 *
 * Call signals, group invitations and peer-group messages carry a CID and
 * nothing else, so the name has to be looked up in the registration roster --
 * the same source the peer list and Messages render from, so a person is named
 * identically wherever they appear.
 *
 * Falls back to `peerDisplayName`'s short handle rather than the raw CID: a
 * twenty-digit number is not a person's name, and it is what the incoming-call
 * card, the participant tile, a group's default title ("<cid>'s Group") and a
 * group message's author line would otherwise show.
 */
export function rosterPeerName(cid: bigint): string {
  const { registeredPeers, allPeers } = p2pRegistrationService.getPeers();
  // Registered peers first — a peer can appear in both, and the registered
  // record is the one whose username the rest of the app trusts.
  const match: ReturnType<typeof registeredPeers.find> = registeredPeers.find((p): boolean => p.cid === cid) ?? allPeers.find((p): boolean => p.cid === cid);
  return peerDisplayName({ cid, username: match?.username, fullName: match?.fullName });
}
