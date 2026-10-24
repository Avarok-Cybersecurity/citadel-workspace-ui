/**
 * An office's or room's chat: the shared chat pane over the node channel's transport.
 *
 * The channel's rules sit where a direct chat has its peer's header. Everything else (the
 * transcript, markdown, replies, edits, retry, drafts, history paging) is the pane's, the same
 * code a direct chat runs.
 */
import { useMemo } from 'react';
import { ChatPane } from '@/components/chat/pane/ChatPane';
import { useLiveGate } from '@/components/chat/pane/use-live-gate';
import type { GroupRestriction } from '@/components/chat/group-restriction';
import { createNodeTransport } from '@/lib/chat/transport/node-transport';
import { nodeChatIO } from '@/lib/chat/transport/node-chat-io';
import type { ChatSelf, ChatTransport } from '@/lib/chat/transport/chat-transport';
import type { ValueStore } from '@/lib/value-store';

interface NodeChatProps {
  channelId: string;
  channelName: string;
  /** Null until the tab knows its account; the reader can read, and sending says why it waits. */
  self: ChatSelf | null;
  sendRestriction: GroupRestriction;
  /** The channel's rules, shown above its messages; null when it has none. */
  rules: string | null;
}

const mintLocalId = (): string => `local-${crypto.randomUUID()}`;

/** A channel's rules, where a direct chat has its peer's header; nothing when it has none. */
export function ChannelRules({ rules }: { rules: string | null }): JSX.Element | null {
  if (rules === null) return null;
  return (
    <div className="px-4 py-2 bg-primary/20 border-b border-primary/40" data-testid="channel-rules">
      <p className="text-sm text-primary-accent">{rules}</p>
    </div>
  );
}

export function NodeChat({ channelId, channelName, self, sendRestriction, rules }: NodeChatProps): JSX.Element {
  const sendGate: ValueStore<GroupRestriction> = useLiveGate(`node-send-gate:${channelId}`, sendRestriction);
  const transport: ChatTransport = useMemo((): ChatTransport => createNodeTransport({
    channelId, channelName, self, sendGate, io: nodeChatIO(channelId), mintLocalId, now: Date.now,
  }), [channelId, channelName, self, sendGate]);
  return (
    <ChatPane
      transport={transport}
      pause={null}
      header={(): JSX.Element | null => <ChannelRules rules={rules} />}
    />
  );
}
