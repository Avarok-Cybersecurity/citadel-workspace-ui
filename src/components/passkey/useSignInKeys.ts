/**
 * Settings -> Sign-in keys: list, add and remove this account's passkeys.
 *
 * Adding the first key needs the password, checked by the agent before it is
 * sealed; it is read from the input at submit time and never held in React
 * state. Adding another key opens the envelope with a key already enrolled.
 */
import { useCallback, useEffect, useState } from 'react';
import { debugLog } from '@/lib/debug-config';
import { useTabIdentity } from '@/hooks/use-tab-identity';
import type { TabIdentity } from '@/lib/tab-identity';
import { verifyAccountPassword } from '@/lib/connection/verify-password';
import {
  browserPasskeyDeps, enrolCredential, failureOf, listCredentials, passkeysAvailableHere, removeCredential,
  type CredentialRecord, type PasskeyDeps,
} from '@/lib/passkey';
import { enrolledCopy, failureCopy } from '@/lib/passkey/copy';

export interface SignInKeys {
  available: boolean;
  account: { username: string; cid: bigint } | null;
  keys: CredentialRecord[];
  busy: boolean;
  message: string | null;
  add: (label: string, readPassword: () => string) => Promise<boolean>;
  remove: (key: CredentialRecord) => Promise<void>;
}

export function useSignInKeys(): SignInKeys {
  const available: boolean = passkeysAvailableHere();
  // This tab's account. The global connection info has no username or cid in
  // a tab that resumed its session, which hid the whole section there.
  const me: TabIdentity | null = useTabIdentity();
  const username: string | undefined = me?.username;
  const cid: bigint | undefined = me?.cid;
  const [keys, setKeys] = useState<CredentialRecord[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh: () => Promise<void> = useCallback(async (): Promise<void> => {
    if (!available || !username) return;
    const deps: PasskeyDeps = browserPasskeyDeps();
    try {
      setKeys(await listCredentials(deps.store, deps.rpId, username));
    } catch (error) {
      debugLog('Passkey', 'Could not list sign-in keys', error);
      setMessage('Your sign-in keys could not be read right now.');
    }
  }, [available, username]);

  useEffect(() => { void refresh(); }, [refresh]);

  const add = async (label: string, readPassword: () => string): Promise<boolean> => {
    if (!username || cid === undefined) return false;
    setBusy(true);
    setMessage(null);
    try {
      let password: string | null = null;
      if (keys.length === 0) {
        password = readPassword();
        if (!password || !(await verifyAccountPassword(username, password))) {
          setMessage("That password isn't right.");
          return false;
        }
      }
      await enrolCredential(browserPasskeyDeps(), { username, cid, label, password });
      setMessage(enrolledCopy(label, username));
      await refresh();
      return true;
    } catch (error) {
      setMessage(failureCopy(failureOf(error)));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (key: CredentialRecord): Promise<void> => {
    if (!username) return;
    setBusy(true);
    try {
      const deps: PasskeyDeps = browserPasskeyDeps();
      await removeCredential(deps.store, deps.rpId, username, key.credentialId);
      await refresh();
    } catch (error) {
      debugLog('Passkey', 'Could not remove a sign-in key', error);
      setMessage('That key could not be removed right now.');
    } finally {
      setBusy(false);
    }
  };

  const account: { username: string; cid: bigint } | null =
    username && cid !== undefined ? { username, cid } : null;
  return { available, account, keys, busy, message, add, remove };
}
