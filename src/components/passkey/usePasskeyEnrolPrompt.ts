/**
 * "Unlock with a passkey or security key next time" -- asked after a password
 * sign-in succeeds, not before, because only then is the password known good.
 *
 * The prompt is a real click, which matters: browsers (Safari especially) only
 * run a WebAuthn ceremony inside a user gesture, and the sign-in round trip is
 * long enough to lose the one that submitted the form.
 *
 * The password stays in the caller's scope while the prompt waits. If the form
 * goes away first, the wait resolves as "not now", so nothing keeps it alive.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastOptions } from '@/hooks/use-toast';
import { browserPasskeyDeps, enrolCredential, failureOf } from '@/lib/passkey';
import { enrolledCopy, failureCopy } from '@/lib/passkey/copy';

export interface EnrolPrompt {
  username: string;
  defaultLabel: string;
  /** A label to enrol with, or null for "Not now". */
  choose: (label: string | null) => void;
}

export interface EnrolRequestArgs {
  username: string;
  cid: bigint;
  password: string;
}

export function defaultPasskeyLabel(userAgent: string): string {
  if (/iPhone|iPad/.test(userAgent)) return 'Passkey on this iPhone or iPad';
  if (/Macintosh/.test(userAgent)) return 'Passkey on this Mac';
  if (/Android/.test(userAgent)) return 'Passkey on this Android device';
  if (/Windows/.test(userAgent)) return 'Windows Hello or security key';
  return 'Passkey or security key';
}

export function usePasskeyEnrolPrompt(toast: (opts: ToastOptions) => unknown): {
  enrolPrompt: EnrolPrompt | null;
  offerEnrolment: (args: EnrolRequestArgs) => Promise<void>;
} {
  const [enrolPrompt, setEnrolPrompt] = useState<EnrolPrompt | null>(null);
  const pending: React.MutableRefObject<((label: string | null) => void) | null> = useRef(null);

  useEffect(() => (): void => { pending.current?.(null); }, []);

  const offerEnrolment: (args: EnrolRequestArgs) => Promise<void> = useCallback(async (args: EnrolRequestArgs): Promise<void> => {
    const label: string | null = await new Promise<string | null>((resolve) => {
      const choose = (value: string | null): void => {
        pending.current = null;
        setEnrolPrompt(null);
        resolve(value);
      };
      pending.current = choose;
      setEnrolPrompt({ username: args.username, defaultLabel: defaultPasskeyLabel(navigator.userAgent), choose });
    });
    if (label === null) return;
    try {
      await enrolCredential(browserPasskeyDeps(), { ...args, label });
      toast({ title: 'Passkey added', description: enrolledCopy(label, args.username) });
    } catch (error) {
      toast({ title: 'Passkey not added', description: failureCopy(failureOf(error)) });
    }
  }, [toast]);

  return { enrolPrompt, offerEnrolment };
}
