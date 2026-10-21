/**
 * Installs this person turned off for themselves, as the server's `DisabledForMe` answers report
 * them. `ListInstalls` does not carry the flag (AppInstall has no field for it), so the answers are
 * what is known, for this tab: the Installed list and a page's app zones read the same set.
 */
import { useSyncExternalStore } from 'react';
import { notifyEach } from '@/lib/notify-listeners';

let disabled: ReadonlySet<string> = new Set();
const listeners: Set<() => void> = new Set();

/** Record the server's answer for one install. */
export function recordDisabledForMe(installId: string, isDisabled: boolean): void {
  const next: Set<string> = new Set(disabled);
  if (isDisabled) next.add(installId); else next.delete(installId);
  disabled = next;
  notifyEach(listeners, 'apps-disabled-for-me');
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => { listeners.delete(listener); };
}

export function useDisabledForMe(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, (): ReadonlySet<string> => disabled, (): ReadonlySet<string> => disabled);
}
