/**
 * Real-shaped chat documents: StarterKit JSON written into Yjs by y-prosemirror (the binding
 * TipTap's Collaboration extension runs) against TipTap's own StarterKit schema, stored exactly
 * as the live-document store stores them. And the mapper stand-in, a test double for the
 * engine's StarterKit importer until it is vendored (see mapper-port.ts).
 */
import * as Y from 'yjs';
import { getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { Schema } from '@tiptap/pm/model';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';
import { newStoredDocument } from '@/lib/live-document-store/document-factory';
import { writeDocTitle } from '@/lib/live-document-store/doc-title';
import { stringToBytes } from '@/lib/utils/encoding-utils';
import type { StoredDocument } from '@/lib/live-document-store/types';
import type { MappedSnapshot, MapperLoader, MigrationMapper } from '../mapper-port';
import { TIPTAP_FRAGMENT } from '../yjs-walker';
import type { FakeLocalDb } from './fake-local-db';

export const STARTER_KIT_SCHEMA: Schema = getSchema([StarterKit.configure({ history: false })]);

/** The Y.Doc the chat editor would hold for `json`, with `title` in its attributes map when given. */
export function chatYDoc(json: JSONContent, title: string | null): Y.Doc {
  const doc: Y.Doc = prosemirrorJSONToYDoc(STARTER_KIT_SCHEMA, json, TIPTAP_FRAGMENT);
  if (title !== null) writeDocTitle(doc, title);
  return doc;
}

/** `json` through the schema: what ProseMirror makes of it, defaults filled in. */
export const canonical = (json: unknown): unknown => STARTER_KIT_SCHEMA.nodeFromJSON(json).toJSON();

export interface Participants {
  readonly holder: bigint;
  readonly peer: bigint;
}

/** Stores `doc` under cid 0 as the live-document store does (saveDocumentToDB's encoding). */
export function storeOriginal(db: FakeLocalDb, docId: string, doc: Y.Doc, who: Participants, title: string): StoredDocument {
  const stored: StoredDocument = newStoredDocument(docId, title, who.peer.toString(), who.holder.toString(), doc);
  db.seed(0n, `live_doc_${docId}`, stringToBytes(JSON.stringify(stored)));
  return stored;
}

export function storeIndex(db: FakeLocalDb, ids: readonly string[]): void {
  db.seed(0n, 'live_doc_index', stringToBytes(JSON.stringify(ids)));
}

export const LOSSLESS_REPORT: string = JSON.stringify({ report: { losses: [] }, problems: [] });

/**
 * Deterministic in its inputs, as the engine's importer must be: the snapshot is the client id
 * and the JSON it was handed, so equal bytes prove the runner handed it equal inputs.
 */
export const echoMapper: MigrationMapper = {
  toSnapshot: (json: string, client: bigint): MappedSnapshot => ({ snapshot: new TextEncoder().encode(`${client.toString()}|${json}`), reportJson: LOSSLESS_REPORT }),
  toDocsPm: (json: string): string => JSON.stringify({ type: 'doc', from: JSON.parse(json) as unknown }),
};

export const loaderOf = (mapper: MigrationMapper | null): MapperLoader => (): Promise<MigrationMapper | null> => Promise.resolve(mapper);

export const STARTER_KIT_SAMPLE: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Plan' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Ship ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Friday' }] },
  ],
};
