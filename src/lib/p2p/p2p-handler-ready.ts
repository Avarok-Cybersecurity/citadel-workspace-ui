/**
 * Whether the P2P messenger's 'websocket-message' subscription is attached in
 * this tab.
 *
 * `eventEmitter.listenerCount('websocket-message')` is NOT a substitute, and
 * that mistake is the reason this module exists: several unrelated services
 * subscribe to the same event at module load — peer registration, workspace
 * responses, group responses, auto-connect — so the count is routinely nonzero
 * long before the messenger, the one consumer forwarded chat messages exist
 * for, has been constructed. Acking on the count would confirm delivery to a
 * handler that never sees the message.
 *
 * The inbound router acks a forwarded message only when this flag is set.
 * Until then the leader keeps the authoritative copy and redelivers.
 */
let attached = false;

export function markP2PMessageHandlerAttached(): void {
  attached = true;
}

export function isP2PMessageHandlerAttached(): boolean {
  return attached;
}
