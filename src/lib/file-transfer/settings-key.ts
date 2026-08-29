import { instanceManager } from '@/lib/multi-instance';

/**
 * The key a peer's file-transfer settings are stored under.
 *
 * Settings are per-account AND per-peer: two accounts in one browser talking to
 * the same peer must not share a max-file-size or an auto-accept switch.
 *
 * It lives here rather than as a private method on the service because the
 * lifecycle module also reads these settings, and it was reading them under the
 * BARE peer CID -- a key nothing writes in a live session. So both the send-time
 * and the accept-time size checks always saw the 100 MiB default, and the user's
 * slider limited nothing on either path. The scoping fix and the accept-limit
 * fix were each correct, and each worked only in isolation.
 *
 * A missing own-CID falls back to the bare peer key rather than inventing a
 * scope: settings written before a session exists belong to no account, and
 * silently filing them under one would be worse.
 */
export function scopedSettingsKey(peerCid: string): string {
  const own: bigint | null = instanceManager.cid;
  return own ? `${own.toString()}:${peerCid}` : peerCid;
}
