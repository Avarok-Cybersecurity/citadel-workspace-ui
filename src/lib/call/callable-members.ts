import type { GroupCallMember } from '@/components/call/GroupCallControls';

/** The parts of a roster entry and a directory entry this needs. */
export interface RosterMember { id: string; username: string; displayName: string }
export interface DirectoryPeer { cid?: bigint; username?: string }

/**
 * The members a call in this room can ring, by CID.
 *
 * A roster id is a USERNAME, not a CID; parsing it as one dropped every member, so no
 * office call could start. The CID comes from the server's peer directory, matched by
 * username. A member the directory does not know is left out rather than guessed.
 */
export function callableMembers(
  members: readonly RosterMember[],
  directory: readonly DirectoryPeer[],
  selfCid: bigint | undefined,
): GroupCallMember[] {
  const cidByUsername: Map<string, bigint> = new Map();
  for (const peer of directory) {
    if (peer.cid !== undefined && peer.username) cidByUsername.set(peer.username, peer.cid);
  }
  const callable: GroupCallMember[] = [];
  for (const member of members) {
    const username: string = member.username || member.id;
    const cid: bigint | undefined = cidByUsername.get(username);
    if (cid === undefined || cid === selfCid) continue;
    callable.push({ cid, username });
  }
  return callable;
}
