/**
 * The v2 result's `formatting` (docs/edit-commands.md): four model values (run and paragraph,
 * effective and direct) and two mixed sets as bit fields over RUN_KEYS and PARAGRAPH_KEYS.
 * The values are the engine's serde of RunProperties and ParagraphProperties; each is checked
 * to be a map, and its fields are the model's (cdoc-edit is their authority).
 */
import { PARAGRAPH_KEYS, RUN_KEYS, type KnownFormatting, type ParagraphKey, type RunKey } from '../caret-formatting';
import type { ParagraphProperties, RunPropertiesPatch } from '../model-values';
import { isMap, readValue, type CodecValue } from './codec-reader';
import { RecordError } from './record-writer';
import type { RecordReader } from './decode-records';

export function map(bytes: Uint8Array, what: string): { readonly [key: string]: CodecValue } {
  const v: CodecValue = readValue(bytes);
  if (!isMap(v)) throw new RecordError(`${what} is not a map`);
  return v;
}

function keySet<K extends string>(bits: bigint, keys: readonly K[], what: string): ReadonlySet<K> {
  if (bits >> BigInt(keys.length) !== 0n) throw new RecordError(`${what} sets a bit past its last key`);
  return new Set<K>(keys.filter((_: K, i: number) => ((bits >> BigInt(i)) & 1n) === 1n));
}

/** The `formatting` block; the caret's section is read later in the record (decode-result.ts). */
export function readFormatting(r: RecordReader): Omit<KnownFormatting, 'section'> {
  const run: RunPropertiesPatch = map(r.bytesField(), 'run') as RunPropertiesPatch;
  const runDirect: RunPropertiesPatch = map(r.bytesField(), 'run_direct') as RunPropertiesPatch;
  const paragraph: ParagraphProperties = map(r.bytesField(), 'paragraph') as ParagraphProperties;
  const paragraphDirect: ParagraphProperties = map(r.bytesField(), 'paragraph_direct') as ParagraphProperties;
  const runMixed: ReadonlySet<RunKey> = keySet(r.uvBig(), RUN_KEYS, 'run_mixed');
  const paragraphMixed: ReadonlySet<ParagraphKey> = keySet(r.uvBig(), PARAGRAPH_KEYS, 'paragraph_mixed');
  return { known: true, run, runDirect, paragraph, paragraphDirect, runMixed, paragraphMixed };
}
