/**
 * The one password login, shared by the password form and passkey unlock.
 *
 * Moved out of `useLoginHandler` (an exact move of its connect body, now that
 * two callers need it) so a passkey sign-in reaches the agent through the very
 * Connect a typed password does: the password comes from the envelope instead
 * of the keyboard, and nothing past this point can tell the difference.
 */
import { isConnectAlreadyInProgress } from '@/lib/connection/is-connect-in-progress';
import { websocketService } from "@/lib/websocket-service";
import { connectionManager } from "@/lib/connection";
import { eventEmitter } from "@/lib/event-emitter";
import { startMessagingForSession } from "@/lib/start-messaging";
import { postAuthSetup } from '@/lib/post-auth-setup';
import { setSelectedUser } from "@/lib/tab-context";
import { debugLog } from '@/lib/debug-config';
import { awaitConnectOutcome, type ConnectOutcome } from '@/lib/connection/await-connect-outcome';
import { mapSecuritySettings, type SessionSecuritySettings } from '@/lib/security-utils';
import type { StoredSessions, StoredSession, ActiveSession } from '@/types/session-types';
import type { SecuritySettingsState } from './useLoginHandler';

export type LoginResult =
  | { kind: 'signed-in'; cid: bigint; messagingReady: boolean }
  /** An existing session was claimed instead; the redirect has already run. */
  | { kind: 'redirected' };

export interface LoginContext {
  redirect: (session: { cid: bigint; username: string; server_address: string }) => Promise<void>;
}

const CONNECT_TIMEOUT_MS: 30000 = 30000;

export async function loginWithPassword(
  ctx: LoginContext, username: string, password: string, securitySettings: SecuritySettingsState,
): Promise<LoginResult> {
  // Metadata only. `connect` takes no server address -- the SDK pinned the
  // account's server in its CNAC at registration and dials that -- so this
  // exists to label the stored session, not to reach anything.
  const storedSessions: StoredSessions = connectionManager.getStoredSessions();
  const storedSession: StoredSession | undefined = storedSessions.sessions.find(s => s.username === username.trim());
  const serverAddress: string = storedSession?.serverAddress ?? '';

  const requestId: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();
  const outcomePromise: Promise<ConnectOutcome> = awaitConnectOutcome(requestId, CONNECT_TIMEOUT_MS);

  // The settings the user actually chose, not the defaults: `auth-operations`
  // fills `undefined` with `getDefaultSecuritySettings()`, so every choice made
  // in the Security Settings dialog used to die in the hook's state.
  const chosenSettings: SessionSecuritySettings = mapSecuritySettings(securitySettings);
  try {
    await websocketService.connect(requestId, username, password, chosenSettings);
  } catch (error) {
    // Nothing will answer a request that was never sent; its timeout must not
    // surface later as an unhandled rejection.
    const _unanswered: Promise<unknown> = outcomePromise.catch((): undefined => undefined);
    throw error;
  }
  const outcome: ConnectOutcome = await outcomePromise;

  if (outcome.kind === 'already-active') {
    // The agent verified the password against the live session: claim it.
    debugLog('Login', `SessionAlreadyActive - ${outcome.message}`);
    await ctx.redirect({ cid: outcome.cid, username: outcome.username || username.trim(), server_address: serverAddress });
    return { kind: 'redirected' };
  }
  if (outcome.kind === 'failed') {
    if (!isConnectAlreadyInProgress(outcome.message)) throw new Error(outcome.message);
    if (outcome.cid && outcome.cid !== 0n) {
      await ctx.redirect({ cid: outcome.cid, username: username.trim(), server_address: serverAddress });
      return { kind: 'redirected' };
    }
    let sessions: ActiveSession[];
    try { sessions = await connectionManager.getActiveSessions(); } catch { throw new Error(outcome.message); }
    const match: ActiveSession | undefined = sessions.find(s => s.username === username.trim());
    if (match?.cid === undefined) throw new Error(outcome.message);
    await ctx.redirect({ cid: match.cid, username: match.username ?? username.trim(), server_address: match.server_address });
    return { kind: 'redirected' };
  }

  const cid: bigint = outcome.cid;
  await connectionManager.handleAuthSuccess({
    username, fullName: username, serverAddress,
    // Stored as chosen too. Persisting the defaults here meant every
    // reconnect silently downgraded to them as well.
    securitySettings: chosenSettings, cid,
  });

  await setSelectedUser({ selectedUsername: username.trim(), selectedServerAddress: serverAddress, selectedCid: cid });
  await postAuthSetup(cid);

  const messagingReady: boolean = await startMessagingForSession(cid.toString());

  eventEmitter.emit('session:activated', {
    cid: cid.toString(), username: username.trim(),
    serverAddress, activationType: 'login',
  });
  return { kind: 'signed-in', cid, messagingReady };
}
