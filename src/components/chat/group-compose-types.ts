/**
 * What a group chat's composer offers, and how its choice maps to the group wire.
 *
 * The composer's type bar speaks the P2P names ('text', 'markdown'); the group wires carry the
 * `GroupMessageType` names ('Text', 'Markdown'). A live document is offered in every group chat:
 * an office or room's is kept by the server, a peer group's by its members.
 */
import type { MessageType } from '@/types/message-protocol';
import type { MemberMessageType } from '@/lib/group-conversations/group-message-codec';

export const GROUP_COMPOSE_TYPES: readonly MessageType[] = ['text', 'markdown', 'live_document'];

export const toMemberType = (type: MessageType): MemberMessageType => (type === 'markdown' ? 'Markdown' : 'Text');
export const toComposeType = (type: MemberMessageType): MessageType => (type === 'Markdown' ? 'markdown' : 'text');
