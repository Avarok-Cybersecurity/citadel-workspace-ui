import { useState } from "react";
import { firstFieldToFix } from '@/lib/first-field-to-fix';

/** The login form's fields, in the order they are rendered. */
const LOGIN_FIELD_ORDER: readonly ["username", "password"] = ['username', 'password'] as const;
type LoginField = (typeof LOGIN_FIELD_ORDER)[number];
import { DEFAULT_SECURITY_SETTINGS } from './security-settings-defaults';
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { getUserFriendlyErrorMessage, getErrorTitle } from "@/lib/error-messages";
import { redirectToExistingSession } from './login-session-redirect';
import { loginWithPassword, type LoginResult } from './login-with-password';
import { usePasskeyAccount, type PasskeyAccount } from './passkey/usePasskeyAccount';
import { usePasskeyEnrolPrompt, type EnrolPrompt } from './passkey/usePasskeyEnrolPrompt';
import { browserPasskeyDeps, failureOf, signInWithPasskey } from '@/lib/passkey';
import { failureCopy } from '@/lib/passkey/copy';
import type { NavigateFunction } from 'react-router';
import type {
  SecurityLevel, SecrecyMode, EncryptionAlgorithm, KemAlgorithm, SigAlgorithm,
} from "@/types";

export interface SecuritySettingsState {
  securityLevel: SecurityLevel;
  secrecyMode: SecrecyMode;
  encryptionAlgorithm: EncryptionAlgorithm;
  kemAlgorithm: KemAlgorithm;
  sigAlgorithm: SigAlgorithm;
  headerObfuscatorSettings: Record<string, string>;
  /** Offer to enrol a passkey after this sign-in. Replaces plaintext "Remember credentials". */
  enrolPasskey: boolean;
}

interface UseLoginHandlerParams {
  onNext: (connectionId: string) => void;
  /** The username the form starts with; undefined starts it empty. */
  initialUsername: string | undefined;
}

/** Everything the sign-in form renders and submits with. */
export interface LoginHandler {
  username: string;
  setUsername: React.Dispatch<React.SetStateAction<string>>;
  password: string;
  setPassword: React.Dispatch<React.SetStateAction<string>>;
  server: string;
  setServer: React.Dispatch<React.SetStateAction<string>>;
  error: string | null;
  loading: boolean;
  securitySettings: SecuritySettingsState;
  // The setter React gives, not a narrowed one: a caller that passes an updater
  // function is doing the ordinary thing, and narrowing this to a plain value
  // makes the hook's own state harder to use than useState's.
  setSecuritySettings: React.Dispatch<React.SetStateAction<SecuritySettingsState>>;
  handleLogin: (e: React.FormEvent) => Promise<void>;
  /** Which field to mark, so the message lands on the control it is about. */
  invalidField: LoginField | null;
  /** Whether passkeys work in this browser, and whether this username has one here. */
  passkey: PasskeyAccount;
  /** Sign in as `account` with its passkey; falls back to the password form on failure. */
  handlePasskeyLogin: (account: string) => Promise<void>;
  /** Set while the form is asking whether to enrol a passkey after sign-in. */
  enrolPrompt: EnrolPrompt | null;
}

export function useLoginHandler({ onNext, initialUsername }: UseLoginHandlerParams): LoginHandler {
  const [username, setUsername] = useState(initialUsername ?? "");
  const [password, setPassword] = useState("");
  // Registration still needs one; signing in does not. Kept so the hook's
  // shape is unchanged for the join flow that shares it.
  const [server, setServer] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The field a refused submit pointed at, so the form can mark it invalid. */
  const [invalidField, setInvalidField] = useState<LoginField | null>(null);
  const [loading, setLoading] = useState(false);
  const [securitySettings, setSecuritySettings] =
    useState<SecuritySettingsState>(DEFAULT_SECURITY_SETTINGS);

  const { toast } = useToast();
  const navigate: NavigateFunction = useNavigate();

  const passkey: PasskeyAccount = usePasskeyAccount(username);
  const { enrolPrompt, offerEnrolment } = usePasskeyEnrolPrompt(toast);

  const doRedirect = (session: { cid: bigint; username: string; server_address: string }): Promise<void> =>
    redirectToExistingSession(session, { navigate, toast, onNext });

  /**
   * Sign in with a password -- typed, or opened by a passkey -- and finish.
   * The password lives in this call's scope only, including while the
   * enrolment prompt waits for the user; it is never put in React state.
   */
  const completeLogin = async (user: string, secret: string, enrol: boolean): Promise<void> => {
    const result: LoginResult = await loginWithPassword({ redirect: doRedirect }, user, secret, securitySettings);
    if (result.kind === 'redirected') return;
    if (enrol) await offerEnrolment({ username: user.trim(), cid: result.cid, password: secret });
    onNext(result.cid.toString());
    // Not an unconditional "Connected to workspace successfully". The ILM
    // messenger can fail to start while everything else succeeds.
    toast(
      result.messagingReady
        ? { title: 'Login successful', description: 'Connected to workspace successfully' }
        : {
            variant: 'destructive',
            title: 'Signed in, but messaging is unavailable',
            description: 'Your workspace loaded. Messages cannot be sent or received until you reload.',
          },
    );
  };

  const handlePasskeyLogin = async (account: string): Promise<void> => {
    const name: string = account.trim();
    if (!name) {
      setInvalidField('username');
      setError('Enter your username first');
      return;
    }
    setLoading(true);
    setError(null);
    setInvalidField(null);
    let unlocked: boolean = false;
    try {
      await signInWithPasskey(browserPasskeyDeps(), name, async (user: string, secret: string): Promise<void> => {
        unlocked = true;
        await completeLogin(user, secret, false);
      });
    } catch (err: unknown) {
      // Before the unlock: the passkey copy, and the password field is right
      // there. After it: the ordinary login failed, reported as the form does.
      if (!unlocked) {
        // The password is the fallback, so the form names the account it is for.
        setUsername(name);
        setError(failureCopy(failureOf(err)));
        document.getElementById('password')?.focus();
      } else {
        setError(getUserFriendlyErrorMessage(err));
        toast({ variant: "destructive", title: getErrorTitle(err), description: getUserFriendlyErrorMessage(err) });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      // And take them to the field, which announcing alone does not.
      //
      // This said the sentence and left focus on Sign In with no field marked
      // invalid: a screen-reader user hears "username and password are
      // required" with their cursor on a button, and there is nothing to say
      // which of the two is missing. The join form was given this in round 230
      // and the login form was not -- the same fix, in one of the two places it
      // belonged.
      const field: "username" | "password" | null = firstFieldToFix(LOGIN_FIELD_ORDER, { username, password });
      setInvalidField(field);
      if (field) document.getElementById(field)?.focus();
      return;
    }

    setLoading(true);
    setError(null);
    setInvalidField(null);

    try {
      // No pre-emptive claim on a username match.
      //
      // This used to look up the active sessions, match on username ALONE, and
      // redirect straight into the session -- so the password box on the login
      // form was never read whenever a session for that username was already
      // active on this agent. The legitimate case is handled one step later by
      // the right party: Connect goes to the server with the credentials, and a
      // live session answers SessionAlreadyActive, which loginWithPassword turns
      // into the same redirect. (docs/ROBUSTNESS.md records the agent's side.)
      //
      // Enrolment is offered only for an account with no key here yet: adding a
      // second key needs one already enrolled, and that lives in Settings.
      await completeLogin(username, password, securitySettings.enrolPasskey && passkey.available && !passkey.hasKeys);
    } catch (err: unknown) {
      setError(getUserFriendlyErrorMessage(err));
      toast({ variant: "destructive", title: getErrorTitle(err), description: getUserFriendlyErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return {
    username, setUsername, password, setPassword, server, setServer,
    error, loading, securitySettings, setSecuritySettings, handleLogin, invalidField,
    passkey, handlePasskeyLogin, enrolPrompt,
  };
}
