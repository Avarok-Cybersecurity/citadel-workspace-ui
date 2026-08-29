import { useEffect, useRef } from 'react';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/hooks/use-toast';
import {
  recordTold,
  shouldTell,
  type NoticeState,
} from '@/lib/persist-failure-notice';

/**
 * Tell somebody when their workspace changes are not reaching the disk.
 *
 * `persistTree` writes the file tree and, when the write fails, emits
 * `revfs:persist-failed` — under a comment explaining that throwing would be
 * wrong, because the operation DID happen and only its durability failed, and
 * that "whoever wires a 'changes may not survive a reload' notice does it here
 * rather than at twenty call sites". Nobody wired it. The tree changed on
 * screen, the write failed, and the only record was a debug line.
 *
 * A component rather than a toast from `persistTree` itself: that module is
 * library code, and business logic reaching for the toaster is the thing SBIO
 * exists to prevent. Its sibling `useDocumentPersistence` toasts directly and
 * is right to — it is a hook, already in the component layer.
 *
 * Renders nothing. It exists to be mounted.
 */
export function PersistFailureNotice(): null {
  const { toast } = useToast();
  const state: React.MutableRefObject<NoticeState> = useRef<NoticeState>({
    lastToldAtMs: new Map<string, number>(),
  });

  useEffect(() => {
    const onFailed = (payload: { treeKey: string }): void => {
      const now: number = Date.now();
      if (!shouldTell(state.current, payload.treeKey, now)) return;
      recordTold(state.current, payload.treeKey, now);
      toast({
        variant: 'destructive',
        title: 'Changes may not survive a reload',
        description: 'This workspace could not be written to disk. Recent changes are only in this tab.',
      });
    };

    eventEmitter.on('revfs:persist-failed', onFailed);
    return (): void => { eventEmitter.off('revfs:persist-failed', onFailed); };
  }, [toast]);

  return null;
}
