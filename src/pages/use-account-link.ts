import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { NavigateFunction } from 'react-router';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { runAsyncSetup } from '@/lib/utils/async-utils';
import { ACCOUNT_LINK_PARAMS, hasAccountLinkParams } from '@/lib/onboarding/account-link-params';

/**
 * Act on `?account=` / `?link=` once, then take them out of the URL.
 *
 * Cleared with `replace`, like `?join=1`, so back/forward and a reload do not
 * replay the link. `onLogin` receives the username when there is no live
 * session to switch to. The parser and the switch flow are imported only when a
 * link is present (account-link-runner.ts), so a plain visit does not load them.
 */
export function useAccountLink(onLogin: (username: string) => void): void {
  const navigate: NavigateFunction = useNavigate();
  const { toast } = useToast();
  const confirm: ReturnType<typeof useConfirm> = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  /** The query string last acted on, so a StrictMode re-run does not act twice. */
  const consumed: React.MutableRefObject<string | null> = useRef<string | null>(null);
  const latestOnLogin: React.MutableRefObject<(username: string) => void> = useRef(onLogin);
  latestOnLogin.current = onLogin;

  useEffect(() => {
    const query: string = searchParams.toString();
    if (consumed.current === query || !hasAccountLinkParams(searchParams)) return;
    consumed.current = query;

    const linkParams: URLSearchParams = new URLSearchParams(searchParams);
    const next: URLSearchParams = new URLSearchParams(searchParams);
    for (const key of ACCOUNT_LINK_PARAMS) next.delete(key);
    setSearchParams(next, { replace: true });

    runAsyncSetup(async (): Promise<void> => {
      const { runAccountLink } = await import('./account-link-runner');
      await runAccountLink(linkParams, { navigate, toast, confirm, login: (username: string) => latestOnLogin.current(username) });
    });
  }, [searchParams, setSearchParams, navigate, toast, confirm]);
}

/**
 * Sign-in that an account link can start: `linkedUsername` is the name the link
 * carried, for the form to start with; `startPlainLogin` is the ordinary button,
 * which clears it.
 */
export function useLinkedLogin(startLogin: () => void): { linkedUsername: string | undefined; startPlainLogin: () => void } {
  const [linkedUsername, setLinkedUsername] = useState<string | undefined>(undefined);
  useAccountLink((username: string): void => { setLinkedUsername(username); startLogin(); });
  const startPlainLogin = (): void => { setLinkedUsername(undefined); startLogin(); };
  return { linkedUsername, startPlainLogin };
}
