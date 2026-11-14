/**
 * The pictures this tab sent, held so the sender's own bubble can show them full size.
 *
 * Once a send is handed to the agent the page keeps no copy, and the offer carries only a
 * 100px thumbnail. The file the person picked is still in hand at send time; it is kept for
 * the life of the tab, bounded by count and bytes. After a reload the sender sees the thumbnail.
 */
import { looksLikePicture } from './image-preview';

const MAX_KEPT: number = 32;
const MAX_KEPT_BYTES: number = 200 * 1024 * 1024;
const kept: Map<string, Blob> = new Map();

function keptBytes(): number {
  let total: number = 0;
  for (const blob of kept.values()) total += blob.size;
  return total;
}

export function rememberSentPicture(transferId: string, file: File): void {
  if (!looksLikePicture(file.name, file.type, file.size)) return;
  kept.set(transferId, file);
  while (kept.size > MAX_KEPT || keptBytes() > MAX_KEPT_BYTES) {
    const oldest: string | undefined = kept.keys().next().value;
    if (oldest === undefined) break;
    kept.delete(oldest);
  }
}

export function sentPicture(transferId: string): Blob | undefined {
  return kept.get(transferId);
}
