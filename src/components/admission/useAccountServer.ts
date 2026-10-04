/**
 * The workspace a sign-in form's account is on, for its human check: the token
 * must be bound to that workspace (account-servers.ts). Asked of the agent once
 * per form; `undefined` until it answers, and for an account it has no host for.
 *
 * When the agent has no host for the account, the server this device remembers
 * for its key-first sign-in (a hint names its tenant) binds it instead: without
 * either, the check renders unbound, and the server refuses its token.
 */
import { useEffect, useState } from 'react';
import { browserAccountServers } from '@/lib/admission';
import type { SignInHint } from '@/lib/sign-in';

/** The agent's host for `username`, else the tenant of this device's only hint for that name. */
export function accountWorkspace(username: string, agentHosts: ReadonlyMap<string, string>, hints: readonly SignInHint[]): string | undefined {
  const name: string = username.trim();
  const host: string | undefined = agentHosts.get(name);
  if (host !== undefined) return host;
  const remembered: readonly SignInHint[] = hints.filter((hint: SignInHint) => hint.username === name);
  // Two workspaces remember this name: which one is meant is not this page's guess.
  return remembered.length === 1 ? remembered[0].tenant : undefined;
}

export function useAccountServer(username: string, hints: readonly SignInHint[]): string | undefined {
  const [servers, setServers] = useState<ReadonlyMap<string, string>>(new Map<string, string>());
  useEffect((): (() => void) => {
    let live: boolean = true;
    browserAccountServers().then((found: ReadonlyMap<string, string>): void => { if (live) setServers(found); }, (): void => undefined);
    return (): void => { live = false; };
  }, []);
  return accountWorkspace(username, servers, hints);
}
