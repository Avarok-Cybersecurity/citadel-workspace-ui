import type { OutputAsset, OutputChunk } from 'rollup';
import { versionManifest } from './deployed-version';

/** The files of a build, as Rollup hands them to `generateBundle`. */
type BuildOutput = Record<string, OutputAsset | OutputChunk>;

/**
 * The `/version.json` text for a build: the entry chunk index.html loads, under `base`.
 * Throws for a build with no such entry, or several, rather than shipping a
 * manifest that no running page could ever match.
 *
 * Rollup names index.html, not src/main.tsx, as that chunk's facade: Vite's HTML entry
 * is the module, and main.tsx is bundled into it. main.tsx's `import.meta.url` is
 * therefore this chunk's URL, which is what the running page compares.
 */
export function manifestForBuild(bundle: BuildOutput, base: string, seqs: { seq: number; minSeq: number | null }): string {
  const entries: OutputChunk[] = Object.values(bundle).filter(
    (output: OutputAsset | OutputChunk): output is OutputChunk =>
      output.type === 'chunk' && output.isEntry && (output.facadeModuleId ?? '').endsWith('/index.html'),
  );
  if (entries.length !== 1) {
    throw new Error(`version.json: expected one index.html entry chunk, found ${entries.length}`);
  }
  const entry: string = `${base}${entries[0].fileName}`;
  return versionManifest(seqs.minSeq === null ? { entry, seq: seqs.seq } : { entry, seq: seqs.seq, minSeq: seqs.minSeq });
}

/**
 * The kill switch from the build's environment (`CITADEL_MIN_BUILD_SEQ`), or null when it is
 * not set. Refused when it is not a whole number of seconds, or when it is above this build's
 * own seq: the build being deployed would then reload itself for ever.
 */
export function minSeqFromEnv(raw: string | undefined, seq: number): number | null {
  if (raw === undefined || raw === '') return null;
  const value: number = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`CITADEL_MIN_BUILD_SEQ must be unix seconds, not "${raw}"`);
  if (value > seq) throw new Error(`CITADEL_MIN_BUILD_SEQ ${value} is above this build's own seq ${seq}`);
  return value;
}
