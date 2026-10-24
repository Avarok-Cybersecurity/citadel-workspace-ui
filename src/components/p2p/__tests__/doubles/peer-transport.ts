/**
 * The real direct-chat transport for a test: the production adapter over whatever messenger,
 * file service and emitter the test has installed. Built once per test and passed to the hook,
 * so the hook's effects see one stable transport (a fresh one per render would resubscribe).
 */
import { createPeerTransport } from '@/lib/chat/transport/peer-transport';
import type { ChatTransport } from '@/lib/chat/transport/chat-transport';
import { APP_OPENING_PORTS } from '../../chat-document/use-chat-documents';

export function peerTransportFor(peer: { cid: bigint; name: string }, selfCid: bigint | null): ChatTransport {
  return createPeerTransport({
    peer: { cid: peer.cid, name: peer.name, username: peer.name },
    self: selfCid === null ? null : { cid: selfCid, username: 'me', displayName: 'You' },
    opening: APP_OPENING_PORTS,
  });
}
