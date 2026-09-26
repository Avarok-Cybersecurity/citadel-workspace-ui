import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { joinServerFrom, withoutJoinParams } from '@/lib/invite-link';

/**
 * Open the join flow when navigated here with `?join=1` -- from Manage
 * Accounts' empty state, or an invite link, which also names the server
 * (`&server=`) to fill in. Clears both once consumed, with `replace`, so
 * back/forward and a reload stay clean.
 */
export function useJoinLink(openServerStep: () => void, fillServer: (address: string) => void): void {
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('join') !== '1') return;
    const server: string | null = joinServerFrom(searchParams);
    if (server !== null) fillServer(server);
    openServerStep();
    setSearchParams(withoutJoinParams(searchParams), { replace: true });
  }, [searchParams, setSearchParams, openServerStep, fillServer]);
}
