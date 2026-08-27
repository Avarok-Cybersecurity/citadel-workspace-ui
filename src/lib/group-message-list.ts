/**
 * How a group's message list changes. Pure, so each rule can be tested on its
 * own — the manager holds the state and the events, these hold the arithmetic.
 */
import type { GroupMessage } from '@/types/workspace-entities';

export function sortByTime(messages: GroupMessage[]): GroupMessage[] {
  // Number() because Array.sort needs a number and timestamps are bigint.
  return [...messages].sort((a, b) => Number(a.timestamp - b.timestamp));
}

/**
 * Fold an older page into the thread already on screen.
 *
 * Merged by id rather than concatenated: if a live message lands in the same
 * window, or a non-paginated response arrives while a page request is in
 * flight, a blind concat would render it twice.
 */
export function mergeOlder(current: GroupMessage[], older: GroupMessage[]): GroupMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of older) byId.set(message.id, message);
  return sortByTime([...byId.values()]);
}

export function applyEdit(
  messages: GroupMessage[],
  messageId: string,
  newContent: string,
  editedAt: bigint,
): GroupMessage[] {
  return messages.map((msg) =>
    msg.id === messageId ? { ...msg, content: newContent, edited_at: editedAt } : msg,
  );
}

export function removeMessage(messages: GroupMessage[], messageId: string): GroupMessage[] {
  return messages.filter((msg) => msg.id !== messageId);
}
