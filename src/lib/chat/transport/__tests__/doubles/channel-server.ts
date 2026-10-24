/**
 * A workspace server holding one node channel, answering the way the kernel does.
 *
 * Only the socket is replaced. Requests go through the real messaging operations and their write
 * waiter (await-write-response), and every answer goes through the real response handler
 * (group-handlers) into the real message manager, so a test that drives the node chat through
 * this exercises everything between the pane and the wire. A test mocks `@/lib/workspace-service`
 * with `channelServer.service` and resets it with `channelServer.reset` before each case.
 */
import * as messaging from '@/lib/workspace-service/messaging-operations';
import type { ProtocolSender } from '@/lib/workspace-service/workspace-operations';
import { handleGroupVariants } from '@/lib/workspace-response-handler/group-handlers';
import { eventEmitter } from '@/lib/event-emitter';
import type { GroupMessage } from '@/types/workspace-entities';
import type { GroupMessageTypeTS, WorkspaceProtocolRequestTS } from '@/types/workspace-protocol';
import type { WorkspaceProtocolResponse } from 'citadel-workspace-client-ts';

/** How the next SendGroupMessage is answered: stored and echoed, refused, or held until `release`. */
export type SendAnswer = { kind: 'store' } | { kind: 'refuse'; reason: string } | { kind: 'hold' };

interface ServerState {
  channelId: string;
  /** The workspace id the server writes as the sender of this session's messages. */
  sessionUser: string;
  stored: GroupMessage[];
  requests: WorkspaceProtocolRequestTS[];
  nextSend: SendAnswer;
  /** False: history requests are taken and never answered (a lost response). */
  answersHistory: boolean;
  held: (() => void)[];
  clock: number;
}

const state: ServerState = { channelId: '', sessionUser: '', stored: [], requests: [], nextSend: { kind: 'store' }, answersHistory: true, held: [], clock: 0 };
const CONNECTION: { cid: number; request_id: string } = { cid: 1, request_id: 'test' };

const answer = (response: WorkspaceProtocolResponse): void => {
  // The kernel's answer is a later frame, never inside the request's own call.
  queueMicrotask((): void => { handleGroupVariants(response, CONNECTION); });
};

function page(before: number | undefined, limit: number): WorkspaceProtocolResponse {
  const older: GroupMessage[] = state.stored.filter((m: GroupMessage): boolean => before === undefined || Number(m.timestamp) < before);
  const messages: GroupMessage[] = older.slice(-limit);
  return { GroupMessages: { group_id: state.channelId, messages, has_more: older.length > messages.length, read_cursors: [] } };
}

type SendRequest = NonNullable<WorkspaceProtocolRequestTS['SendGroupMessage']>;

function store(request: SendRequest): void {
  state.clock += 1;
  const message: GroupMessage = {
    id: `server-${state.clock}`, group_id: request.group_id, sender_id: state.sessionUser, sender_name: state.sessionUser,
    message_type: request.message_type as GroupMessage['message_type'], content: request.content, timestamp: BigInt(10_000 + state.clock),
    reply_to: request.reply_to ?? null, reply_count: 0, mentions: [], edited_at: null,
  };
  state.stored.push(message);
  answer({ GroupMessageNotification: { group_id: request.group_id, message } });
}

const sender: ProtocolSender = {
  currentCid: 1n,
  sendProtocolRequest: async (request: WorkspaceProtocolRequestTS): Promise<void> => {
    state.requests.push(request);
    if (request.GetGroupMessages !== undefined) {
      const { before_timestamp, limit } = request.GetGroupMessages;
      if (state.answersHistory) answer(page(before_timestamp ?? undefined, limit ?? 50));
      return;
    }
    if (request.SendGroupMessage !== undefined) {
      const send: SendRequest = request.SendGroupMessage;
      const how: SendAnswer = state.nextSend;
      if (how.kind === 'refuse') queueMicrotask((): void => { eventEmitter.emit('workspace:raw-response', { Error: how.reason }); });
      else if (how.kind === 'hold') state.held.push((): void => store(send));
      else store(send);
      return;
    }
    if (request.EditGroupMessage !== undefined) {
      const { group_id, message_id, new_content } = request.EditGroupMessage;
      answer({ GroupMessageEdited: { group_id, message_id, new_content, edited_at: 20_000n } });
      return;
    }
    if (request.DeleteGroupMessage !== undefined) {
      const { group_id, message_id } = request.DeleteGroupMessage;
      state.stored = state.stored.filter((m: GroupMessage): boolean => m.id !== message_id);
      answer({ GroupMessageDeleted: { group_id, message_id, deleted_by: state.sessionUser } });
    }
  },
};

export interface ChannelServer {
  /** Mocked in for the default export of `@/lib/workspace-service`. */
  readonly service: {
    getGroupMessages(groupId: string, before?: number | bigint, limit?: number): Promise<void>;
    sendGroupMessage(groupId: string, content: string, type?: GroupMessageTypeTS, replyTo?: string): Promise<void>;
    editGroupMessage(groupId: string, messageId: string, content: string): Promise<void>;
    deleteGroupMessage(groupId: string, messageId: string): Promise<void>;
  };
  reset(channelId: string, sessionUser: string, stored: GroupMessage[]): void;
  nextSend: SendAnswer;
  answersHistory: boolean;
  readonly requests: readonly WorkspaceProtocolRequestTS[];
  release(): void;
  broadcast(message: GroupMessage): void;
}

export const channelServer: ChannelServer = {
  service: {
    getGroupMessages: (groupId: string, before?: number | bigint, limit?: number): Promise<void> => messaging.getGroupMessages(sender, groupId, before, limit),
    sendGroupMessage: (groupId: string, content: string, type?: GroupMessageTypeTS, replyTo?: string): Promise<void> => messaging.sendGroupMessage(sender, groupId, content, type, replyTo),
    editGroupMessage: (groupId: string, messageId: string, content: string): Promise<void> => messaging.editGroupMessage(sender, groupId, messageId, content),
    deleteGroupMessage: (groupId: string, messageId: string): Promise<void> => messaging.deleteGroupMessage(sender, groupId, messageId),
  },
  reset(channelId: string, sessionUser: string, stored: GroupMessage[]): void {
    Object.assign(state, { channelId, sessionUser, stored: [...stored], requests: [], nextSend: { kind: 'store' }, answersHistory: true, held: [], clock: 0 });
  },
  get nextSend(): SendAnswer { return state.nextSend; },
  set nextSend(how: SendAnswer) { state.nextSend = how; },
  get answersHistory(): boolean { return state.answersHistory; },
  set answersHistory(answers: boolean) { state.answersHistory = answers; },
  get requests(): readonly WorkspaceProtocolRequestTS[] { return state.requests; },
  /** Answers every held send, in order. */
  release(): void { const held: (() => void)[] = state.held.splice(0); held.forEach((run: () => void): void => run()); },
  /** Another member's message, broadcast as the kernel does. */
  broadcast(message: GroupMessage): void { state.stored.push(message); answer({ GroupMessageNotification: { group_id: message.group_id, message } }); },
};

/** A stored channel message; only `id`, sender, text and time vary between the tests' fixtures. */
export function channelMessage(id: string, sender: string, content: string, timestamp: number, extra: Partial<GroupMessage>): GroupMessage {
  return {
    id, group_id: state.channelId, sender_id: sender, sender_name: sender, message_type: 'Text', content,
    timestamp: BigInt(timestamp), reply_to: null, reply_count: 0, mentions: [], edited_at: null, ...extra,
  };
}
