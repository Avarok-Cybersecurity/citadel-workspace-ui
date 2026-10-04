/**
 * Who announces a notification outside the page: the agent or the browser.
 *
 * One notification per message. An agent that hosts the account's conversations
 * raises its own native notice for each message (kernel/notices/decide.rs), held
 * back for a focused window that shows it (ReportFocus). The browser used to
 * raise an OS notification and a chime for the same message too. So a hosted
 * conversation's message is the agent's to announce, and everything the agent
 * does not host -- group chat, system notices, a browser that runs messaging
 * itself -- stays the browser's.
 *
 * A product decision (2026-10-04), reversible here alone. Its cost: an agent
 * with no menu-bar app listening raises nothing, and nor does the browser.
 *
 * Pure: whether the agent hosts is the caller's to find out (capabilities.ts).
 */
import { NotificationType, type Notification } from './types';

export type NotificationOwner = 'agent' | 'browser';

/** A P2P conversation's message: it names its peer (message-arrival-notification.ts). */
function isConversationMessage(n: Pick<Notification, 'type' | 'data'>): boolean {
  return n.type === NotificationType.MESSAGE && n.data?.peerCid !== undefined;
}

export function notificationOwner(n: Pick<Notification, 'type' | 'data'>, agentHostsConversations: boolean): NotificationOwner {
  return agentHostsConversations && isConversationMessage(n) ? 'agent' : 'browser';
}
