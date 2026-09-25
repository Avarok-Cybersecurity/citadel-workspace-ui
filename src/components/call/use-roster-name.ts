import { useEffect, useState } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { isPlaceholderName } from '@/lib/peer-display';
import { rosterPeerName } from '@/lib/roster-peer-name';

/** The roster events after which a peer's name may have become known. */
const ROSTER_CHANGED: readonly string[] = ['p2p:peers-updated', 'p2p:peer-registered'];

/**
 * `known`, or -- while `known` is only a placeholder -- the name the roster
 * learns for `cid` later.
 *
 * A call names its participants once, when the signal arrives. A page that has
 * just reloaded has not loaded its roster by then, so a caller was frozen as
 * "Peer 6W1TP1" for the whole call while the sidebar beside it learned "alice".
 * Held per cid, so a tile reused for someone else does not keep the old name.
 * Asked by the participant tile and by the screen-share label, which both
 * show a name the call froze at signal time.
 */
export function useRosterName(cid: bigint | null, known: string): string {
  const [learned, setLearned] = useState<{ cid: bigint; name: string } | null>(null);

  useEffect(() => {
    // Null is "nobody to look up" -- this tab's own share, or no share at all.
    if (cid === null || !isPlaceholderName(known)) return;
    const refresh = (): void => {
      const name: string = rosterPeerName(cid);
      if (!isPlaceholderName(name)) setLearned({ cid, name });
    };
    refresh();
    for (const event of ROSTER_CHANGED) eventEmitter.on(event, refresh);
    return (): void => {
      for (const event of ROSTER_CHANGED) eventEmitter.off(event, refresh);
    };
  }, [cid, known]);

  if (!isPlaceholderName(known)) return known;
  return learned !== null && learned.cid === cid ? learned.name : known;
}
