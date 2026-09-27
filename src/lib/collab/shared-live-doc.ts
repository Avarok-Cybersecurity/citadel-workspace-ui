/**
 * A live document as a chat message names it, and the text that message carries for a build
 * that cannot open live documents in that chat (the office wire and the peer envelope alike).
 */
export interface SharedLiveDoc { readonly id: string; readonly title: string }

export const sharedLiveDocText = (title: string): string => `Shared a live document: ${title}`;

/** The longest title a document is given; the kernel caps office documents the same. */
export const MAX_LIVE_DOC_TITLE_CHARS: number = 120;
const DOC_ID: RegExp = /^[0-9a-f-]{8,64}$/;

/** The document a message names, or undefined when its fields are not a well-formed one. */
export function sharedLiveDocOf(id: unknown, title: unknown): SharedLiveDoc | undefined {
  if (typeof id !== 'string' || !DOC_ID.test(id) || typeof title !== 'string') return undefined;
  const trimmed: string = title.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_LIVE_DOC_TITLE_CHARS ? { id, title: trimmed } : undefined;
}
