/**
 * A redelivered message replaces its bell entry; it does not add a second.
 *
 * `addNotification` keyed the map by a fresh `uuidv4()`, so two calls carrying
 * the same `sourceId` produced two entries for one message. ILM redelivers on
 * reconnect and on a missed ACK, so a flaky link showed the same message two,
 * three, four times.
 *
 * A test already claimed this could not happen — "keys a redelivered message
 * to the same id, so it cannot stack" — but it mocked `addMessageNotification`
 * wholesale and asserted the ARGUMENT it was called with. Nothing reached this
 * method. No change to production code could turn it red, and replacing the
 * source id with a constant kept it green too. It certified a guarantee the
 * product did not have.
 *
 * These assert the EFFECT: how many notifications exist afterwards.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { notificationService } from '../service';
import { NotificationType } from '../types';

beforeEach(() => {
  for (const n of notificationService.getNotifications()) {
    notificationService.removeNotification(n.id);
  }
});

describe('a redelivered message does not stack', () => {
  it('keeps one entry when the same message arrives twice', () => {
    notificationService.addMessageNotification('alice', 'hello', 'alice', 'msg-1');
    notificationService.addMessageNotification('alice', 'hello', 'alice', 'msg-1');

    expect(
      notificationService.getNotifications().length,
      'the same message produced two bell entries',
    ).toBe(1);
  });

  it('still adds a second entry for a genuinely different message', () => {
    // The control. Without it the fix could collapse every notification into
    // one and no assertion about redelivery would notice.
    notificationService.addMessageNotification('alice', 'hello', 'alice', 'msg-1');
    notificationService.addMessageNotification('alice', 'goodbye', 'alice', 'msg-2');

    expect(notificationService.getNotifications().length).toBe(2);
  });

  it('does not collapse different notification types sharing a source id', () => {
    // sourceId is a message id for messages and a request id for peer
    // registration. Two namespaces; a collision between them must not merge.
    notificationService.addMessageNotification('alice', 'hello', 'alice', 'shared');
    notificationService.addNotification({
      type: NotificationType.PEER_REGISTRATION,
      title: 'alice', content: 'wants to connect', senderId: 'alice', sourceId: 'shared',
    } as Parameters<typeof notificationService.addNotification>[0]);

    expect(notificationService.getNotifications().length).toBe(2);
  });

  it('still adds entries that carry no source id at all', () => {
    notificationService.addNotification({
      type: NotificationType.SYSTEM, title: 'a', content: 'b', senderId: 'sys',
    } as Parameters<typeof notificationService.addNotification>[0]);
    notificationService.addNotification({
      type: NotificationType.SYSTEM, title: 'c', content: 'd', senderId: 'sys',
    } as Parameters<typeof notificationService.addNotification>[0]);

    expect(notificationService.getNotifications().length).toBe(2);
  });
});
