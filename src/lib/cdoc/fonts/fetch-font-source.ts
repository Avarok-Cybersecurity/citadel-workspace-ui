/**
 * The font port's browser adapter: fetches a face from the served font directory and refuses
 * it unless its sha256 is the manifest's, so a stale or tampered file can never lay a document
 * out with different metrics than the one every other reader uses.
 */
import type { FontFaceEntry, FontSource } from './font-manifest';

function hex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest), (b: number): string => b.toString(16).padStart(2, '0')).join('');
}

export function fetchFontSource(baseUrl: string, timeoutMs: number): FontSource {
  return {
    async load(face: FontFaceEntry): Promise<Uint8Array> {
      const url: string = `${baseUrl}${encodeURIComponent(face.file)}`;
      const response: Response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`font ${face.file}: HTTP ${response.status}`);
      const bytes: ArrayBuffer = await response.arrayBuffer();
      const sha: string = hex(await crypto.subtle.digest('SHA-256', bytes));
      if (sha !== face.sha256) throw new Error(`font ${face.file}: sha256 ${sha} is not the manifest's ${face.sha256}`);
      return new Uint8Array(bytes);
    },
  };
}
