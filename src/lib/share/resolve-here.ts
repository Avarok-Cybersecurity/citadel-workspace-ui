/**
 * `resolvePendingRedirectWith`, wired to this tab: its stored link, its session, the toast.
 * The one function every post-sign-in path calls.
 */
import { toast } from 'sonner';
import { browserSessionStorage } from '@/lib/chat/draft-handoff';
import { getSelectedUser, type TabUserContext } from '@/lib/tab-context';
import { connectionManager } from '@/lib/connection';
import { tabIdentity } from '@/lib/tab-identity';
import type { StoredSession } from '@/types/session-types';
import { peekPendingRedirect, takePendingRedirect } from './pending-redirect';
import { resolvePendingRedirectWith, UNAVAILABLE_COPY } from './resolve-pending-redirect';
import { secureLinksApi } from './secure-links-api';

async function thisTabsServer(): Promise<string | null> {
  const selection: TabUserContext | null = await getSelectedUser();
  const session: StoredSession | null = await connectionManager.getTabSelectedSession();
  return tabIdentity(selection, session).serverAddress ?? null;
}

/** Open the link this tab arrived with, or go to `fallback` (null: stay). */
export function resolvePendingRedirect(navigate: (path: string) => void, fallback: string | null): Promise<void> {
  return resolvePendingRedirectWith({
    peek: () => peekPendingRedirect(browserSessionStorage()),
    take: () => takePendingRedirect(browserSessionStorage()),
    ready: secureLinksApi.ready,
    sessionServer: thisTabsServer,
    resolve: secureLinksApi.resolve,
    navigate,
    unavailable: (detail: string): void => { toast.error(UNAVAILABLE_COPY.title, { description: detail }); },
  }, fallback);
}
