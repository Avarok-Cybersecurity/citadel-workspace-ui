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
export function manifestForBuild(bundle: BuildOutput, base: string): string {
  const entries: OutputChunk[] = Object.values(bundle).filter(
    (output: OutputAsset | OutputChunk): output is OutputChunk =>
      output.type === 'chunk' && output.isEntry && (output.facadeModuleId ?? '').endsWith('/index.html'),
  );
  if (entries.length !== 1) {
    throw new Error(`version.json: expected one index.html entry chunk, found ${entries.length}`);
  }
  return versionManifest(`${base}${entries[0].fileName}`);
}
