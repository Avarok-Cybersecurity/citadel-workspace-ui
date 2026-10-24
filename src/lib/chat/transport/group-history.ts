/**
 * The history port of a group conversation, a node channel's or a peer group's.
 *
 * Both keep their messages in one in-memory log per group (groupMessagingManager, here behind
 * `GroupLog`) and differ only in where a page comes from: the workspace server for a channel,
 * the local transcript for a peer group, which has no server history and no older pages. The
 * reader's own unconfirmed sends (pending-group-sends) are shown beside the log until the
 * transport's copy settles them.
 */
import type { GroupMessage } from '@/types/workspace-entities';
import { notifyEach } from '@/lib/notify-listeners';
import type { GroupMessageEvent } from '@/lib/group-messaging-manager';
import { groupChatMessage, STORED } from './group-chat-message';
import type { PendingSends } from './pending-group-sends';
import type { ChatMessage, ChatSelf, HistoryCursor, HistoryEvent, HistoryPage, HistoryPort } from './chat-transport';

/** One group's messages as this tab holds them. */
export interface GroupLog {
  messages(): readonly GroupMessage[];
  /** Whether the source said there is history before the oldest message held. */
  hasMore(): boolean;
  subscribe(listener: (event: GroupMessageEvent) => void): () => void;
}

/** Where a group's pages come from; each resolves once the page is in the log. */
export interface GroupPages {
  latest(): Promise<void>;
  /** Null where nothing older can be asked for. */
  readonly older: ((before: bigint) => Promise<void>) | null;
}

export interface GroupHistoryParams {
  readonly self: ChatSelf | null;
  readonly log: GroupLog;
  readonly pages: GroupPages;
  /** Null where every send is confirmed before it is shown. */
  readonly pending: PendingSends | null;
  readonly markRead: () => void;
  readonly focus: () => () => void;
  readonly clearNotices: () => void;
}

export interface GroupHistory {
  readonly port: HistoryPort;
  /** Tells the pane about a local copy the adapter changed. */
  emit(event: HistoryEvent): void;
}

export function groupHistory({ self, log, pages, pending, markRead, focus, clearNotices }: GroupHistoryParams): GroupHistory {
  const listeners: Set<(event: HistoryEvent) => void> = new Set();
  let stopLog: () => void = (): void => undefined;
  // Pages this port asked for: they come back through `loadLatest`/`loadOlder`, not as arrivals.
  let asked: number = 0;
  const asking = async (load: () => Promise<void>): Promise<void> => {
    asked += 1;
    try { await load(); } finally { asked -= 1; }
  };
  // One subscriber that throws must not keep the others from hearing it.
  const emit = (event: HistoryEvent): void => notifyEach(listeners, 'group history', event);
  const stamp = (messages: readonly GroupMessage[]): ChatMessage[] => messages.map((m: GroupMessage): ChatMessage => groupChatMessage(m, self, STORED));
  const olderThan = (held: readonly GroupMessage[]): HistoryCursor | null =>
    pages.older !== null && log.hasMore() && held.length > 0 ? { kind: 'before', timestamp: held[0].timestamp } : null;

  const onLog = (event: GroupMessageEvent): void => {
    switch (event.type) {
      case 'new_message': {
        if (event.message === undefined) return;
        const message: ChatMessage = groupChatMessage(event.message, self, STORED);
        const localId: string | null = message.author.own && pending !== null ? pending.settle(event.message) : null;
        emit(localId !== null ? { kind: 'replaced', localId, message } : { kind: 'arrived', message, incoming: !message.author.own });
        return;
      }
      case 'message_edited':
        if (event.messageId === undefined || event.message === undefined) return;
        emit({ kind: 'updated', message: groupChatMessage(event.message, self, STORED) });
        return;
      case 'message_reacted':
        if (event.messageId === undefined || event.message === undefined) return;
        emit({ kind: 'updated', message: { id: event.messageId, reactions: event.message.reactions ?? [] } });
        return;
      case 'message_deleted':
        if (event.messageId !== undefined) emit({ kind: 'removed', messageId: event.messageId });
        return;
      // A reload this pane did not ask for (a reconnect): what it brought is shown, not announced.
      case 'messages_loaded':
        if (asked > 0) return;
        for (const message of stamp(event.messages ?? [])) emit({ kind: 'recorded', message });
        return;
    }
  };

  const port: HistoryPort = {
    loadLatest: async (): Promise<HistoryPage> => {
      await asking(pages.latest);
      const held: readonly GroupMessage[] = log.messages();
      return { messages: [...stamp(held), ...(pending?.all() ?? [])], older: olderThan(held) };
    },
    loadOlder: async (cursor: HistoryCursor): Promise<HistoryPage> => {
      const older: ((before: bigint) => Promise<void>) | null = pages.older;
      if (cursor.kind !== 'before' || older === null) return { messages: [], older: null };
      await asking((): Promise<void> => older(cursor.timestamp));
      const held: readonly GroupMessage[] = log.messages();
      return { messages: stamp(held.filter((m: GroupMessage): boolean => m.timestamp < cursor.timestamp)), older: olderThan(held) };
    },
    cached: (): readonly ChatMessage[] => [...stamp(log.messages()), ...(pending?.all() ?? [])],
    subscribe: (listener: (event: HistoryEvent) => void): (() => void) => {
      if (listeners.size === 0) stopLog = log.subscribe(onLog);
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
        if (listeners.size === 0) { stopLog(); stopLog = (): void => undefined; }
      };
    },
    markRead: async (): Promise<void> => markRead(),
    focus,
    clearNotices,
  };
  return { port, emit };
}
