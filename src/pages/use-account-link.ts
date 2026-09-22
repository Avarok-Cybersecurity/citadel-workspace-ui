import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { NavigateFunction } from 'react-router';
import { useToast } from '@/hooks/use-toast';
import { connectionManager } from '@/lib/connection';
import { withoutForgotten } from '@/lib/sessions/forgotten-sessions';
import { withWorkspaceNames } from '@/lib/sessions/with-workspace';
import { readLastAccessed } from '@/lib/sessions/last-accessed';
import { switchToSession } from '@/lib/sessions/switch-to-session';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { debugLog } from '@/lib/debug-config';
import {
  ACCOUNT_LINK_PARAMS, hasAccountLinkParams, parseAccountLink, type AccountLink,
} from '@/lib/onboarding/account-link';
import { openAccountLink } from '@/lib/onboarding/open-account-link';
import type { OrphanSessionWithWorkspace } from '@/components/useOrphanSessions';

/**
 * Act on `?account=` / `?link=` once, then take them out of the URL.
 *
 * Cleared with `replace`, like `?join=1`, so back/forward and a reload do not
 * replay the link. `onLogin` receives the username when there is no live
 * session to switch to.
 */
export function useAccountLink(onLogin: (username: string) => void): void {
  const navigate: NavigateFunction = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  /** The query string last acted on, so a StrictMode re-run does not act twice. */
  const consumed: React.MutableRefObject<string | null> = useRef<string | null>(null);
  const latestOnLogin: React.MutableRefObject<(username: string) => void> = useRef(onLogin);
  latestOnLogin.current = onLogin;

  useEffect(() => {
    const query: string = searchParams.toString();
    if (consumed.current === query || !hasAccountLinkParams(searchParams)) return;
    consumed.current = query;

    const link: AccountLink | null = parseAccountLink(searchParams);
    const next: URLSearchParams = new URLSearchParams(searchParams);
    for (const key of ACCOUNT_LINK_PARAMS) next.delete(key);
    setSearchParams(next, { replace: true });

    if (!link) {
      debugLog('Landing', 'Ignoring a malformed account link');
      return;
    }

    runAsyncSetup(async (): Promise<void> => {
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
        switchTo: (session: OrphanSessionWithWorkspace) => switchToSession(session, { navigate, toast }),
        login: (username: string) => latestOnLogin.current(username),
      });
    });
  }, [searchParams, setSearchParams, navigate, toast]);
}
