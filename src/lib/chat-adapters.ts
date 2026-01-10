/**
 * Chat Adapters Index
 *
 * Re-exports all chat messaging adapters for easy importing.
 * Use these adapters to abstract away the differences between P2P and Group messaging.
 */

// Base adapter interface
export {
  ChatMessagingAdapter,
  type ChatMessage,
  type ChatMessageEvent,
  type ChatMessageEventType,
  type SendMessageOptions,
  type ChatMessagingAdapterFactory,
} from './chat-messaging-adapter';

// P2P adapter
export {
  P2PMessagingAdapter,
  createP2PMessagingAdapter,
} from './p2p-messaging-adapter';

// Group adapter
export {
  GroupMessagingAdapter,
  createGroupMessagingAdapter,
} from './group-messaging-adapter';
