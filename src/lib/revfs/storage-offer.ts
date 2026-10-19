/**
 * Whether the open storage takes files: an answer, never a default. A server's storage is not
 * known until GetServerCapabilities answers, and until then nothing offers it; a peer's is the
 * person's own setting for that peer. Every place that says so reads its words from here.
 */
export type StorageOffer =
  | { readonly kind: 'checking' }
  | { readonly kind: 'offered' }
  | { readonly kind: 'refused'; readonly reason: string };

export const SERVER_STORAGE_CHECKING: string = 'Checking whether this server stores files…';
export const SERVER_STORAGE_OFF: string = 'Server storage is not available.';
export const PEER_STORAGE_OFF: string = 'P2P remote storage is not enabled for this peer.';

export const CHECKING: StorageOffer = { kind: 'checking' };
export const OFFERED: StorageOffer = { kind: 'offered' };

export const offerOf = (takesFiles: boolean, refusal: string): StorageOffer => (takesFiles ? OFFERED : { kind: 'refused', reason: refusal });
