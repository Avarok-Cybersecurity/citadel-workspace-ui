/**
 * Half-written messages, kept when you look at another conversation.
 *
 * The composer's text was plain component state, and the chat is keyed by peer
 * — deliberately, because an unkeyed composer leaked one conversation's draft
 * into another. So switching conversations unmounted the composer and the draft
 * went with it: mid-message to Alice, you click Bob to check something she
 * asked about, and your paragraph is gone. Silently. Every chat product this
 * one resembles keeps it.
 *
 * The keyed remount stays — it is the fix for the worse bug — and the text
 * lives out here instead, one entry per conversation. Held in memory only: a
 * draft is a thought in progress, and persisting it to disk on a product whose
 * subject is privacy is a decision to make deliberately rather than as a side
 * effect of fixing this.
 */

const drafts: Map<string, string> = new Map<string, string>();

/** Remember what is typed but unsent for a conversation. */
export function saveDraft(conversationKey: string, text: string): void {
  // An empty draft is not a draft; keeping it would resurrect a cleared box.
  if (text === '') {
    drafts.delete(conversationKey);
    return;
  }
  drafts.set(conversationKey, text);
}

/** What was typed but unsent, or empty. */
export function loadDraft(conversationKey: string): string {
  return drafts.get(conversationKey) ?? '';
}

/** Forget a conversation's draft — after a send, or when it is deleted. */
export function clearDraft(conversationKey: string): void {
  drafts.delete(conversationKey);
}

/** Test-only. */
export function clearAllDraftsForTests(): void {
  drafts.clear();
}
