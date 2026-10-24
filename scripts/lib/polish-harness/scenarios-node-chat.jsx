/**
 * An office channel's whole chat: the real pane over the real node transport, with the server
 * replaced by a page of messages held in memory (the harness has no workspace server). Senders
 * named, the reader's own messages on the right, a markdown message, a reply, a long unbroken
 * token, a system line and the channel's rules.
 */
import { useMemo } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmDialogProvider } from '@/components/shared/confirm-dialog';
import { ChatPane } from '@/components/chat/pane/ChatPane';
import { ChannelRules } from '@/components/office/NodeChat';
import { createNodeTransport } from '@/lib/chat/transport/node-transport';
import { groupLog } from '@/lib/chat/transport/group-log';
import { groupMessagingManager } from '@/lib/group-messaging-manager';
import { createValueStore } from '@/lib/value-store';

const CHANNEL = 'harness-channel';
const at = (minutes) => BigInt(new Date().setHours(10, minutes, 0, 0));
const message = (id, sender, name, content, minutes, extra) => ({
  id, group_id: CHANNEL, sender_id: sender, sender_name: name, message_type: 'Text', content, timestamp: at(minutes),
  reply_to: null, reply_count: 0, mentions: [], edited_at: null, ...extra,
});
const MESSAGES = [
  message('g1', 'ada', 'Ada Lovelace', 'Morning all. The analytical engine notes are in the shared folder.', 0, {}),
  message('g2', 'grace', 'Grace Hopper', 'Thanks Ada. There is a very long identifier in section four: a-very-long-unbroken-token-that-must-wrap-inside-the-bubble-and-not-push-the-layout.', 2, {}),
  message('s1', 'system', 'System', 'Grace Hopper joined the room', 3, { message_type: 'System' }),
  message('g3', 'me', 'Me', 'Sounds good. I will **review** after.', 5, { message_type: 'Markdown', reply_to: 'g1' }),
  message('g4', 'me', 'Me', 'One more thing: can someone check the build?', 6, {}),
];

const io = {
  log: groupLog(CHANNEL),
  latest: async () => { groupMessagingManager.handleMessagesLoaded(CHANNEL, MESSAGES, false); },
  older: async () => {},
  send: async () => {},
  edit: async () => {},
  remove: async () => {},
  focus: () => () => {},
};

export function NodeChatScenario() {
  const transport = useMemo(() => createNodeTransport({
    channelId: CHANNEL, channelName: 'Engine room', self: { cid: 1n, username: 'me', displayName: 'Me' },
    sendGate: createValueStore('harness-gate', 'allowed'), io, mintLocalId: () => `local-${Date.now()}`, now: Date.now,
  }), []);
  return (
    <div style={{ height: '100vh' }} className="bg-background">
      <ConfirmDialogProvider><TooltipProvider>
        <ChatPane transport={transport} pause={null} header={() => <ChannelRules rules="Keep it about the engine." />} />
      </TooltipProvider></ConfirmDialogProvider>
    </div>
  );
}

export const NODE_CHAT_SCENARIOS = { 'node-chat': NodeChatScenario };
