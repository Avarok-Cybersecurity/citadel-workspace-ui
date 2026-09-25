import { NotificationType, NotificationPriority , type Notification } from './types';

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
  return {
    type: NotificationType.PEER_REGISTRATION,
    title: `${params.peerUsername} wants to connect`,
    // The handle, not the CID: a truncated CID ("CID: 165819323455...") is
    // noise to the reader, who identifies people by name and handle.
    content: `@${params.peerUsername}`,
    senderId: params.peerCid,
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
