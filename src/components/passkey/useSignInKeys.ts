/**
 * Settings -> Sign-in keys, backed by the server through SignInManagement.
 *
 * The server holds the account's factors and verifies every change; this only
 * asks. Each change needs a fresh step-up (the password, or a key touch),
 * collected by `requestStepUp` at the moment of the change and never kept. A
 * refusal is shown in the server's own words -- "removing that key would leave
 * no way to satisfy the sign-in policy" says more than anything written here.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTabIdentity } from '@/hooks/use-tab-identity';
import type { TabIdentity } from '@/lib/tab-identity';
import { passkeysAvailableHere } from '@/lib/passkey';
import { stringToBytes } from '@/lib/utils/encoding-utils';
import {
  addSecurityKey, browserSignInDeps, manageSignIn, saveHint, tenantOf, type SignInDeps,
} from '@/lib/sign-in';
import { keyFailureCopy } from '@/lib/sign-in/copy';
import type { AccountRef, SignInCredential, SignInManagementOp, SignInManagementOutcome, SignInPolicy, StepUp } from '@/lib/sign-in/types';

export interface SignInKeys {
  available: boolean;
  account: AccountRef | null;
  /** Null until the server has answered. */
  credentials: SignInCredential[] | null;
  /** What this window last set or can infer; the server does not report it. */
  policy: SignInPolicy | null;
  busy: boolean;
  message: string | null;
  /** New recovery codes, to show once and then forget. */
  freshCodes: readonly string[] | null;
  forgetCodes: () => void;
  add: (label: string) => Promise<boolean>;
  rename: (id: number, label: string) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
  setPolicy: (policy: SignInPolicy) => Promise<void>;
  regenerateCodes: () => Promise<void>;
}

/** Collects the step-up for one change: the typed password, null to use a key, or cancelled. */
export type StepUpRequest = () => Promise<string | null | 'cancelled'>;

const NO_STEP_UP: StepUp = { password: null, security_key: false };

export function useSignInKeys(requestStepUp: StepUpRequest): SignInKeys {
  const available: boolean = passkeysAvailableHere();
  const me: TabIdentity | null = useTabIdentity();
  const account: AccountRef | null = me?.username && me.cid !== undefined && me.serverAddress
    ? { tenant: tenantOf(me.serverAddress), cid: me.cid, username: me.username } : null;
  const cid: bigint | undefined = account?.cid;
  const [credentials, setCredentials] = useState<SignInCredential[] | null>(null);
  const [policy, setPolicyState] = useState<SignInPolicy | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [freshCodes, setFreshCodes] = useState<readonly string[] | null>(null);

  const refresh: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (cid === undefined) return;
    try {
      const outcome: SignInManagementOutcome = await manageSignIn(browserSignInDeps().send, cid, 'ListCredentials', NO_STEP_UP);
      if (typeof outcome === 'object' && 'Credentials' in outcome) {
        setCredentials(outcome.Credentials);
        // KeyOnly is the one policy the factors themselves show: no password factor.
        if (!outcome.Credentials.some((c: SignInCredential) => c.kind === 'Password')) setPolicyState('KeyOnly');
      }
    } catch (error) {
      setMessage(keyFailureCopy(error));
    }
  }, [cid]);

  useEffect(() => { void refresh(); }, [refresh]);

  /** One change: step up, ask the server, refresh. Resolves with the outcome, or null if it did not happen. */
  const change = async (run: (deps: SignInDeps, stepUp: StepUp) => Promise<SignInManagementOutcome | number>, done: string): Promise<SignInManagementOutcome | number | null> => {
    if (!account) return null;
    const typed: string | null | 'cancelled' = await requestStepUp();
    if (typed === 'cancelled') return null;
    setBusy(true);
    setMessage(null);
    try {
      const outcome: SignInManagementOutcome | number = await run(browserSignInDeps(),
        { password: typed === null ? null : stringToBytes(typed), security_key: available });
      setMessage(done);
      await refresh();
      return outcome;
    } catch (error) {
      setMessage(keyFailureCopy(error));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const op = (o: SignInManagementOp): ((deps: SignInDeps, stepUp: StepUp) => Promise<SignInManagementOutcome>) => (deps: SignInDeps, stepUp: StepUp): Promise<SignInManagementOutcome> =>
    manageSignIn(deps.send, account?.cid ?? 0n, o, stepUp);

  const existingIds = (): number[][] =>
    (credentials ?? []).flatMap((c: SignInCredential) => (c.credential_id ? [c.credential_id] : []));

  return {
    available, account, credentials, policy, busy, message, freshCodes,
    forgetCodes: (): void => setFreshCodes(null),
    add: async (label: string): Promise<boolean> => account !== null && (await change(
      (deps, stepUp) => addSecurityKey(deps, { account, label, existingCredentialIds: existingIds() }, stepUp),
      `${label} can now sign in to ${account.username}.`)) !== null,
    rename: async (id: number, label: string): Promise<boolean> =>
      (await change(op({ RenameCredential: { id, label } }), 'Renamed.')) !== null,
    remove: async (id: number): Promise<void> => { await change(op({ RemoveCredential: { id } }), 'Removed.'); },
    setPolicy: async (next: SignInPolicy): Promise<void> => {
      if (!account || (await change(op({ SetSignInPolicy: { policy: next } }), 'Saved.')) === null) return;
      setPolicyState(next);
      await saveHint(browserSignInDeps().store, { ...account, keyFirst: next === 'KeyOnly' })
        .catch((error: unknown): void => setMessage(`Saved, but this device could not remember it: ${keyFailureCopy(error)}`));
    },
    regenerateCodes: async (): Promise<void> => {
      const outcome: SignInManagementOutcome | number | null = await change(op('RegenerateRecoveryCodes'), '');
      if (outcome !== null && typeof outcome === 'object' && 'RecoveryCodes' in outcome) setFreshCodes(outcome.RecoveryCodes);
    },
  };
}
