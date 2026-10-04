/**
 * The OS notification and its chime, for a window that is not in front
 * (in-front.ts), and only for what the agent does not announce itself (owner.ts).
 */
import { playNotificationChime } from './chime';
import { showBrowserNotification } from './browser-notification';
import { mayInterruptTheOs } from './in-front';
import { notificationOwner } from './owner';
import { agentHostsConversations } from '@/lib/agent-conversations/capabilities';
import type { Notification } from './types';

export async function interruptTheOs(notification: Notification): Promise<void> {
  if (!mayInterruptTheOs()) return;
  // Unknown is not hosted: a failed capability answer must not silence the browser too.
  const hosts: boolean = await agentHostsConversations().catch((): boolean => false);
  // The agent does not yet say whether a notifier is attached to it; see owner.ts.
  if (notificationOwner(notification, { hostsConversations: hosts, notifierAttached: false }) !== 'browser') return;
  showBrowserNotification(notification);
  playNotificationChime();
}
