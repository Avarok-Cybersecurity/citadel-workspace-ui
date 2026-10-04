/**
 * The workspace a sign-in form's account is on, for its human check: the token
 * must be bound to that workspace (account-servers.ts). Asked of the agent once
 * per form; `undefined` until it answers, and for an account it has no host for.
 */
import { useEffect, useState } from 'react';
import { browserAccountServers } from '@/lib/admission';

export function useAccountServer(username: string): string | undefined {
  const [servers, setServers] = useState<ReadonlyMap<string, string>>(new Map<string, string>());
  useEffect((): (() => void) => {
    let live: boolean = true;
    browserAccountServers().then((found: ReadonlyMap<string, string>): void => { if (live) setServers(found); }, (): void => undefined);
    return (): void => { live = false; };
  }, []);
  return servers.get(username.trim());
}
