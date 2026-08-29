/**
 * Messenger CID Resolver
 *
 * Resolves the current user's CID using multiple fallback strategies.
 * Also provides presence update helpers for peer connect/disconnect.
 */

import { connectionManager } from '../connection';
import { getSelectedUser } from '../tab-context';
import { instanceManager } from '../multi-instance';
import { MessagingLayerType } from '@/types/messaging-layer';
import type { PeerPresence } from './p2p-types';
import type { ConversationManager } from './conversation-manager';
import type { PresenceManager } from './presence-manager';

type EmitFn = (event: string, data: unknown) => void;

/**
 * Resolve the current CID using multiple fallback strategies.
 * Priority: instanceManager.cid > selectedUser > tabSession > connectionInfo
 */
export async function resolveCurrentCid(): Promise<bigint | null> {
  const instanceCid: bigint | null = instanceManager.cid;
  if (instanceCid) return instanceCid;
  try {
    const timeout: Promise<null> = new Promise<null>((resolve) => setTimeout((): void => resolve(null), 500));
    const tabSelection = await Promise.race([getSelectedUser(), timeout]);
    if (tabSelection?.selectedCid) return tabSelection.selectedCid;
  } catch { /* continue */ }
  try {
    const timeout: Promise<null> = new Promise<null>((resolve) => setTimeout((): void => resolve(null), 500));
    const tabSession = await Promise.race([connectionManager.getTabSelectedSession(), timeout]);
    if (tabSession?.cid) return tabSession.cid;
  } catch { /* continue */ }
  const connectionInfo = connectionManager.getConnectionInfo();
  return connectionInfo?.cid ?? null;
}

/**
 * Update peer presence to Online and broadcast.
 */
export function updatePeerPresenceOnConnect(
  conversationManager: ConversationManager,
  presenceManager: PresenceManager,
  emit: EmitFn,
  peerCid: bigint
): void {
  const conversation = conversationManager.getConversation(peerCid);
  if (conversation) {
    const newPresence: PeerPresence = { status: MessagingLayerType.Online as const, lastUpdate: Date.now() };
    conversation.presence = newPresence;
    presenceManager.notifyPresenceChange(peerCid, newPresence);
    emit('p2p:presence-updated', { peerCid: peerCid.toString(), presence: newPresence });
  }
  void presenceManager.broadcastOnlineToNewPeer(peerCid);
}

/**
 * Update peer presence to Offline.
 */
export function updatePeerPresenceOnDisconnect(
  conversationManager: ConversationManager,
  presenceManager: PresenceManager,
  emit: EmitFn,
  peerCid: bigint
): void {
  const conversation = conversationManager.getConversation(peerCid);
  if (conversation) {
    const newPresence: PeerPresence = { status: MessagingLayerType.Offline as const, lastUpdate: Date.now() };
    conversation.presence = newPresence;
    presenceManager.notifyPresenceChange(peerCid, newPresence);
    emit('p2p:presence-updated', { peerCid: peerCid.toString(), presence: newPresence });
  }
}
