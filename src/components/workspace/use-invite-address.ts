import { useEffect, useState } from 'react';
import { getSelectedUser, type TabUserContext } from '@/lib/tab-context';
import { runAsyncSetup } from '@/lib/utils/async-utils';

/**
 * The address to invite people to: the connection record's when it has one,
 * else the one this tab's selection names. A resumed tab's connection record
 * can be CID-only, and the dialog then offered nothing to send.
 */
export function useInviteAddress(open: boolean, connectionAddress: string | undefined): string | undefined {
  const [selected, setSelected] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open || connectionAddress) return;
    let cancelled: boolean = false;
    runAsyncSetup(async (): Promise<void> => {
      const tab: TabUserContext | null = await getSelectedUser();
      if (!cancelled) setSelected(tab?.selectedServerAddress || undefined);
    });
    return (): void => { cancelled = true; };
  }, [open, connectionAddress]);

  return connectionAddress || selected;
}
