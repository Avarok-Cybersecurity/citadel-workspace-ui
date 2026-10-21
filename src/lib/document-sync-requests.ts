/**
 * "Sync this document's edits now": what sharing a document asks, wherever it was shared from.
 * A session open in this tab registers how it syncs (DocumentSession.save, which with AutoSave
 * off sends every edit made so far); with none open, edits held on this device by closed tabs
 * are sent by a session opened for that alone (lib/cdoc/collab/headless-sync.ts), loaded only
 * then so neither it nor Citadel Docs is in the shell's bundle.
 */
type Sync = () => Promise<void>;

const open: Map<string, Set<Sync>> = new Map<string, Set<Sync>>();

/** A session for `nodeId` is open in this tab; the returned function says it closed. */
export function registerDocumentSync(nodeId: string, sync: Sync): () => void {
  const syncs: Set<Sync> = open.get(nodeId) ?? new Set<Sync>();
  syncs.add(sync);
  open.set(nodeId, syncs);
  return (): void => {
    syncs.delete(sync);
    if (syncs.size === 0) open.delete(nodeId);
  };
}

export async function requestDocumentSync(nodeId: string): Promise<void> {
  const syncs: Set<Sync> | undefined = open.get(nodeId);
  if (syncs) {
    await Promise.all([...syncs].map((sync: Sync): Promise<void> => sync()));
    return;
  }
  const { syncHeldEditsHere } = await import('@/lib/cdoc/collab/headless-sync');
  await syncHeldEditsHere(nodeId);
}
