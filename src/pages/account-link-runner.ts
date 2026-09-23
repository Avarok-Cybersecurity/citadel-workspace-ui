import type { NavigateFunction } from 'react-router';
import type { useToast } from '@/hooks/use-toast';
import { connectionManager } from '@/lib/connection';
import { withoutForgotten } from '@/lib/sessions/forgotten-sessions';
import { withWorkspaceNames } from '@/lib/sessions/with-workspace';
import { readLastAccessed } from '@/lib/sessions/last-accessed';
import { switchToSession } from '@/lib/sessions/switch-to-session';
import { debugLog } from '@/lib/debug-config';
import { parseAccountLink, type AccountLink } from '@/lib/onboarding/account-link';
import { openAccountLink } from '@/lib/onboarding/open-account-link';
import type { OrphanSessionWithWorkspace } from '@/components/useOrphanSessions';

type Toast = ReturnType<typeof useToast>['toast'];

/**
 * What the landing page runs for a URL that carries an account link: parse it, then
 * switch to its live session or start sign-in with its username. Loaded on demand by
 * use-account-link.ts, only when such a link is present.
 */
export async function runAccountLink(
  params: URLSearchParams,
  deps: { navigate: NavigateFunction; toast: Toast; login: (username: string) => void },
): Promise<void> {
  const link: AccountLink | null = parseAccountLink(params);
  if (!link) {
    debugLog('Landing', 'Ignoring a malformed account link');
    return;
  }
  await openAccountLink<OrphanSessionWithWorkspace>(link, {
    listSessions: async () => {
      await connectionManager.waitForReady();
      const { ok, sessions } = await connectionManager.getActiveSessionsResult();
      return {
        ok,
        sessions: withWorkspaceNames(
          withoutForgotten(sessions),
          connectionManager.getStoredSessions().sessions,
          readLastAccessed,
        ),
      };
    },
    switchTo: (session: OrphanSessionWithWorkspace) => switchToSession(session, { navigate: deps.navigate, toast: deps.toast }),
    login: deps.login,
  });
}
