import type { OutputAsset, OutputChunk } from 'rollup';
import { versionManifest } from './deployed-version';

/** The files of a build, as Rollup hands them to `generateBundle`. */
type BuildOutput = Record<string, OutputAsset | OutputChunk>;

/**
 * The `/version.json` text for a build: its src/main.tsx entry, under `base`.
 * Throws for a build with no such entry, or several, rather than shipping a
 * manifest that no running page could ever match.
 */
export function manifestForBuild(bundle: BuildOutput, base: string): string {
  const entries: OutputChunk[] = Object.values(bundle).filter(
    (output: OutputAsset | OutputChunk): output is OutputChunk =>
      output.type === 'chunk' && output.isEntry && (output.facadeModuleId ?? '').endsWith('/src/main.tsx'),
  );
  if (entries.length !== 1) {
    throw new Error(`version.json: expected one src/main.tsx entry chunk, found ${entries.length}`);
  }
  return versionManifest(`${base}${entries[0].fileName}`);
}
