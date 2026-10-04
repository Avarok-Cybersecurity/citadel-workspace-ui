/**
 * A live document's title, carried by the document itself.
 *
 * The title lives in the Yjs doc (`getMap('cdoc')`, key `title` -- the map the
 * citadel-docs architecture reserves for document attributes), so the CRDT
 * delivers a rename to every peer and concurrent renames converge. The store's
 * DocumentMetadata and the tab title are mirrors of it, never a second source.
 */

import type * as Y from 'yjs';

export const DOC_ATTRIBUTES_MAP: 'cdoc' = 'cdoc';
export const DOC_TITLE_KEY: 'title' = 'title';
export const DOC_TITLE_MAX_LENGTH: 80 = 80;

export type TitleCheck = { ok: true; title: string } | { ok: false; reason: string };

/** Collapse whitespace runs (newlines, tabs) so a title is always one line. */
function normalise(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function validateDocTitle(raw: string): TitleCheck {
  const title: string = normalise(raw);
  if (!title) return { ok: false, reason: 'Enter a title for the document.' };
  if (title.length > DOC_TITLE_MAX_LENGTH) {
    return { ok: false, reason: `Keep the title to ${DOC_TITLE_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, title };
}

function attributes(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(DOC_ATTRIBUTES_MAP);
}

/**
 * The title a document carries, or null when it has none or what it carries is
 * unusable. A peer wrote this value, so it is re-checked here: a non-string or
 * blank is ignored, and an over-long one is cut rather than trusted.
 */
export function readDocTitle(doc: Y.Doc): string | null {
  const raw: unknown = attributes(doc).get(DOC_TITLE_KEY);
  if (typeof raw !== 'string') return null;
  const title: string = normalise(raw).slice(0, DOC_TITLE_MAX_LENGTH).trim();
  return title || null;
}

/** Writes a validated title; throws on an invalid one so no caller can skip the check. */
export function writeDocTitle(doc: Y.Doc, raw: string): string {
  const check: TitleCheck = validateDocTitle(raw);
  if (!check.ok) throw new Error(check.reason);
  attributes(doc).set(DOC_TITLE_KEY, check.title);
  return check.title;
}

/** Calls `onTitle` whenever the title changes, whoever changed it. Returns the unsubscribe. */
export function observeDocTitle(doc: Y.Doc, onTitle: (title: string) => void): () => void {
  const map: Y.Map<unknown> = attributes(doc);
  const handler = (event: Y.YMapEvent<unknown>): void => {
    if (!event.keysChanged.has(DOC_TITLE_KEY)) return;
    const title: string | null = readDocTitle(doc);
    if (title) onTitle(title);
  };
  map.observe(handler);
  return (): void => map.unobserve(handler);
}
