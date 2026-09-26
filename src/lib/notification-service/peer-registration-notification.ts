import { NotificationType, NotificationPriority , type Notification } from './types';
import { memberDisplayName } from '@/lib/member-names';

/**
 * The shape of a "someone wants to connect" notification.
 *
 * Separate from the service because it is the only notification carrying
 * action buttons, and those buttons hold live callbacks — accept and decline
 * both send on the wire. That makes this the one notification whose payload is
 * behaviour rather than text, which is worth being able to read in one place.
 */
export function peerRegistrationNotification(params: {
  peerUsername: string;
  peerCid: string;
  requestId: string;
  onAccept: () => void;
  onDecline: () => void;
  onCardClick: () => void;
  recipientCid?: string;
}): Omit<Notification, 'id' | 'timestamp' | 'read'> {
  // The roster's name where it knows one, as every other surface shows them.
  const name: string = memberDisplayName(params.peerUsername) ?? params.peerUsername;
  return {
    type: NotificationType.PEER_REGISTRATION,
    title: `${name} wants to connect`,
    // The handle, not the CID: a truncated CID ("CID: 165819323455...") is
    // noise to the reader, who identifies people by name and handle.
    content: `@${params.peerUsername}`,
    senderId: params.peerCid,
    senderName: name,
    sourceId: params.requestId,
    recipientCid: params.recipientCid,
    priority: NotificationPriority.HIGH,
    actionButtons: [
      { id: 'accept', label: 'Accept', variant: 'default', onClick: params.onAccept },
      { id: 'decline', label: 'Decline', variant: 'destructive', onClick: params.onDecline },
    ],
    data: {
      requestId: params.requestId,
      peerCid: params.peerCid,
      peerUsername: params.peerUsername,
      onCardClick: params.onCardClick,
    },
  };
}
