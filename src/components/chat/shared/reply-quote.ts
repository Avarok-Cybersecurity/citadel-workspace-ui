/**
 * What a reply shows of the message it answers.
 *
 * Both chat surfaces carried the reference and neither showed it: P2P replies
 * sent `reply_to` and no bubble read it; the group bubble read it only to say
 * "Replying to a message". The quote is resolved from the messages already
 * loaded -- there is no fetch for one message -- so `null` is an honest answer
 * ("not loaded"), not a failure.
 */
import type { P2PMessage } from '@/lib/p2p';
import type { GroupMessage } from '@/types/workspace-entities';

export interface QuotedMessage {
  readonly id: string;
  readonly authorName: string;
  /** One line, whitespace collapsed; the component truncates visually too. */
  readonly excerpt: string;
}

const EXCERPT_MAX_CHARS: number = 120;

export function replyExcerpt(text: string): string {
  const oneLine: string = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > EXCERPT_MAX_CHARS
    ? `${oneLine.slice(0, EXCERPT_MAX_CHARS - 1).trimEnd()}…`
    : oneLine;
}

/** A file or document message has no text of its own; its name stands in. */
function p2pQuotableText(message: P2PMessage): string {
  if (message.message_type === 'file_transfer') return message.file_name ?? 'A file';
  if (message.message_type === 'live_document') return message.document_title ?? 'A document';
  return message.content;
}

export function quoteP2PReply(
  replyTo: string,
  byId: ReadonlyMap<string, P2PMessage>,
  authorOf: (message: P2PMessage) => string,
): QuotedMessage | null {
  const original: P2PMessage | undefined = byId.get(replyTo);
  if (!original) return null;
  return { id: original.id, authorName: authorOf(original), excerpt: replyExcerpt(p2pQuotableText(original)) };
}

export function quoteGroupReply(
  replyTo: string,
  byId: ReadonlyMap<string, GroupMessage>,
): QuotedMessage | null {
  const original: GroupMessage | undefined = byId.get(replyTo);
  if (!original) return null;
  return { id: original.id, authorName: original.sender_name, excerpt: replyExcerpt(original.content) };
}
