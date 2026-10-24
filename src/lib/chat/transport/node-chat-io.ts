/**
 * Where the node channel's transport meets the workspace server: the only module of its own that
 * sends a request, so node-transport is tested with this port replaced and nothing else.
 */
import WorkspaceService from '@/lib/workspace-service';
import { groupMessagingManager, type GroupMessageEvent } from '@/lib/group-messaging-manager';
import { GroupMessageTypeTS } from '@/types/workspace-protocol';
import { armLoadingDeadline, cancelLoadingDeadline } from '@/lib/loading-flag-timeout';
import { markChannelOpen } from '@/lib/group-conversations/open-channel';
import { channelSignals, type ChannelSignal } from '@/lib/group-conversations/channel-signals';
import NotificationService from '@/lib/notification-service';
import { getPrivacySettings, type PrivacySettings } from '@/lib/privacy-settings';
import { groupLog } from './group-log';
import type { GroupLog } from './group-history';

/** What a node channel's adapter asks of the workspace server. */
export interface NodeChatIO {
  readonly log: GroupLog;
  /** Each resolves once the page is in the log, and rejects when it does not come. */
  latest(): Promise<void>;
  older(before: bigint): Promise<void>;
  send(content: string, kind: 'text' | 'markdown', replyTo: string | null): Promise<void>;
  edit(messageId: string, content: string): Promise<void>;
  remove(messageId: string): Promise<void>;
  focus(): () => void;
  react(messageId: string, emoji: string, on: boolean): Promise<void>;
  /** Resolves once the server holds `member`'s cursor at `uptoMessageId`. */
  markRead(uptoMessageId: string, member: string): Promise<void>;
  typing(): Promise<void>;
  /** The members' read cursors and typing notices, as the response handler records them. */
  readonly signals: {
    cursors(): ReadonlyMap<string, string>;
    subscribe(listener: (signal: ChannelSignal) => void): () => void;
  };
  /** Marks the bell's notifications for this channel read. */
  clearNotices(): void;
  privacy(): Pick<PrivacySettings, 'sendReadReceipts' | 'showTypingIndicators'>;
}

/**
 * Resolves when the requested page has been put in the log. The request resolves when it is SENT,
 * so the page is the `messages_loaded` that follows it; a page that never comes is a rejection
 * after the loading deadline, not a load that spins forever.
 */
function pageArrives(groupId: string, deadlineKey: string, request: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve: () => void, reject: (reason: unknown) => void): void => {
    const stop: () => void = groupMessagingManager.subscribeToGroup(groupId, (event: GroupMessageEvent): void => {
      if (event.type !== 'messages_loaded') return;
      stop();
      cancelLoadingDeadline(deadlineKey);
      resolve();
    });
    armLoadingDeadline(deadlineKey, (): void => { stop(); reject(new Error('The channel did not answer, so its messages could not be loaded.')); });
    request().catch((error: unknown): void => { stop(); cancelLoadingDeadline(deadlineKey); reject(error); });
  });
}

export function nodeChatIO(groupId: string): NodeChatIO {
  return {
    log: groupLog(groupId),
    latest: (): Promise<void> => pageArrives(groupId, `group-messages:${groupId}`, (): Promise<void> => WorkspaceService.getGroupMessages(groupId)),
    older: (before: bigint): Promise<void> => {
      // The response carries no cursor, so the manager is told to merge it rather than replace the thread.
      groupMessagingManager.markLoadingOlder(groupId);
      return pageArrives(groupId, `group-messages-more:${groupId}`, (): Promise<void> => WorkspaceService.getGroupMessages(groupId, before))
        .catch((error: unknown): never => { groupMessagingManager.clearLoadingOlder(groupId); throw error; });
    },
    send: (content: string, kind: 'text' | 'markdown', replyTo: string | null): Promise<void> =>
      WorkspaceService.sendGroupMessage(groupId, content, kind === 'markdown' ? GroupMessageTypeTS.Markdown : GroupMessageTypeTS.Text, replyTo ?? undefined),
    edit: (messageId: string, content: string): Promise<void> => WorkspaceService.editGroupMessage(groupId, messageId, content),
    remove: (messageId: string): Promise<void> => WorkspaceService.deleteGroupMessage(groupId, messageId),
    focus: (): (() => void) => markChannelOpen(groupId),
    react: (messageId: string, emoji: string, on: boolean): Promise<void> => WorkspaceService.reactGroupMessage(groupId, messageId, emoji, on),
    markRead: (uptoMessageId: string, member: string): Promise<void> => WorkspaceService.markGroupRead(groupId, uptoMessageId, member),
    typing: (): Promise<void> => WorkspaceService.groupTyping(groupId),
    signals: {
      cursors: (): ReadonlyMap<string, string> => channelSignals.cursors(groupId),
      subscribe: (listener: (signal: ChannelSignal) => void): (() => void) => channelSignals.subscribe(groupId, listener),
    },
    clearNotices: (): void => NotificationService.getInstance().markGroupNotificationsAsRead(groupId),
    privacy: (): Pick<PrivacySettings, 'sendReadReceipts' | 'showTypingIndicators'> => getPrivacySettings(),
  };
}
