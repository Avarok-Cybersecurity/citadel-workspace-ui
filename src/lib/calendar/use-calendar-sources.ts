/**
 * Keeps the store's sources read (design 3.3.1, C3): each once when the pane mounts, and again
 * whenever the kernel says a key of that source changed (`StorageChanged`). Two reads of one
 * source can be in flight at once (a change arriving mid-read); only the newest one's answer is
 * kept, so an older, slower read cannot overwrite a newer one.
 */
import { useEffect } from 'react';
import type { StorageChange } from '@/lib/citadel-apps/host/glue-instance';
import type { CalendarEngine } from './engine/calendar-engine';
import { PortRefused, refusalCopy, type CalendarPorts } from './ports';
import { readSource, sourceOfChange, type ReadSource, type SourceRead } from './read-sources';
import type { CalendarAction } from './store';

const SOURCES: readonly ReadSource[] = ['node', 'authored', 'private'];

function reasonOf(error: unknown): string {
  if (error instanceof PortRefused) return refusalCopy(error.refused);
  return 'something went wrong reading it';
}

export function useCalendarSources(ports: CalendarPorts, engine: CalendarEngine, node: string, dispatch: (action: CalendarAction) => void): void {
  useEffect(() => {
    let live: boolean = true;
    const latest: Map<ReadSource, number> = new Map();
    const read = async (source: ReadSource): Promise<void> => {
      const turn: number = (latest.get(source) ?? 0) + 1;
      latest.set(source, turn);
      dispatch({ type: 'loading', source });
      try {
        const got: SourceRead = await readSource(ports, engine, source, node);
        if (live && latest.get(source) === turn) dispatch({ type: 'read', source, entries: got.entries, unreadable: got.unreadable });
      } catch (error: unknown) {
        if (!(error instanceof PortRefused)) console.error(`[calendar] reading ${source} failed`, error);
        if (live && latest.get(source) === turn) dispatch({ type: 'failed', source, reason: reasonOf(error) });
      }
    };
    for (const source of SOURCES) void read(source);
    const off: () => void = ports.onStorageChanged((change: StorageChange): void => {
      const source: ReadSource | null = sourceOfChange(change, node);
      if (live && source !== null) void read(source);
    });
    return (): void => {
      live = false;
      off();
    };
  }, [ports, engine, node, dispatch]);
}
