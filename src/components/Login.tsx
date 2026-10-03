import { CitadelLogo } from '@/components/brand/CitadelLogo';
import { useDialogOverlay } from '@/hooks/use-dialog-overlay';
import { LoginAdvancedOptions } from "./LoginAdvancedOptions";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ChevronLeft, Loader2, User, LogIn } from "lucide-react";
import { SecuritySettings, SecuritySettingsValues } from "./SecuritySettings";
import { useLoginHandler, type LoginHandler } from "./useLoginHandler";
import { PasskeySignIn } from "./passkey/PasskeySignIn";
import { passkeyChoices, usePasskeyAccounts } from "./passkey/usePasskeyAccounts";
import { LoginFactorFields } from "./LoginFactorFields";
import { AddSecurityKeyCard } from "./sign-in/AddSecurityKeyCard";
import { RecoverySessionScreen } from "./sign-in/RecoverySessionScreen";
import { useSignInHints } from "./sign-in/useSignInHints";
import { websocketService } from "@/lib/websocket-service";
import { passkeysAvailableHere } from "@/lib/passkey";
import type { SignInHint } from "@/lib/sign-in";
import { SIGN_IN_COPY } from "@/lib/sign-in/copy";

interface LoginProps {
  onNext: (connectionId: string) => void;
  onCancel: () => void;
  /** A username to start with (from an account link); the password is still typed. */
  initialUsername: string | undefined;
}

export function Login({ onNext, onCancel, initialUsername }: LoginProps): JSX.Element {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);

  const h: LoginHandler = useLoginHandler({ onNext, initialUsername });
  const {
    username, setUsername, error, invalidField, loading, securitySettings, setSecuritySettings,
    handleLogin, passkey, handlePasskeyLogin, handleKeyLogin, keyOffer, recoverySession, mode,
  } = h;

  // Offered before a username is typed: option-A passkeys (to move them to the
  // server) and accounts that sign in key-first here, scoped by tenant and CID.
  const legacyAccounts: string[] = usePasskeyAccounts();
  const hints: SignInHint[] = useSignInHints();
  const hintNames: string[] = hints.map((hint: SignInHint) => hint.username);
  const deviceAccounts: string[] = [...new Set([...legacyAccounts, ...hintNames])].sort((a, b) => a.localeCompare(b));
  const typedHasKeys: boolean = passkey.hasKeys || hintNames.includes(username.trim());
  const passkeyAccounts: string[] = mode === 'password' ? passkeyChoices(username, typedHasKeys, deviceAccounts) : [];
  const signInAs = (account: string): void => {
    if (legacyAccounts.includes(account)) void handlePasskeyLogin(account);
    else void handleKeyLogin(account);
  };

  const handleSecuritySettingsComplete = (values: SecuritySettingsValues): void => {
    setSecuritySettings({
      securityLevel: values.securityLevel,
      secrecyMode: values.secrecyMode,
      encryptionAlgorithm: values.encryptionAlgorithm,
      kemAlgorithm: values.kemAlgorithm,
      sigAlgorithm: values.sigAlgorithm,
      headerObfuscatorSettings: values.headerObfuscatorSettings,
      enrolPasskey: values.enrolPasskey ?? false,
    });
    // SecuritySettings calls onComplete INSTEAD of onNext, so this is where Save closes the
    // panel; without it Save stored the values and left the user stranded on it.
    setShowSecuritySettings(false);
  };

  const { ref: dialogRef, dialogProps } = useDialogOverlay({
    label: 'Sign in',
    onDismiss: onCancel,
    // SecuritySettings brings its own dialog treatment when shown.
    enabled: !showSecuritySettings,
  });

  // Declared after the overlay's own first-field focus so it runs later: with
  // the username already known, the field left to fill is the password.
  useEffect((): void => {
    if (initialUsername) document.getElementById('password')?.focus();
  }, [initialUsername]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4" ref={dialogRef} {...dialogProps}>
      {recoverySession ? (
        <Card className="bg-background border-border shadow-2xl shadow-black/40 w-full max-w-md">
          <CardContent className="pt-6">
            <RecoverySessionScreen
              account={recoverySession}
              signOut={async (): Promise<void> => { await websocketService.disconnect(recoverySession.cid); h.endRecoverySession(); }}
            />
          </CardContent>
        </Card>
      ) : keyOffer ? (
        <Card className="bg-background border-border shadow-2xl shadow-black/40 w-full max-w-md" data-testid="passkey-enrol">
          <CardContent className="pt-6">
            <AddSecurityKeyCard account={keyOffer.account} stepUp={keyOffer.stepUp} title={keyOffer.title} body={keyOffer.body} onFinished={keyOffer.finish} />
          </CardContent>
        </Card>
      ) : showSecuritySettings ? (
        <SecuritySettings
          onNext={() => setShowSecuritySettings(false)}
          onBack={() => setShowSecuritySettings(false)}
          onComplete={handleSecuritySettingsComplete}
          initialValues={{
            securityLevel: securitySettings.securityLevel,
            secrecyMode: securitySettings.secrecyMode,
            encryptionAlgorithm: securitySettings.encryptionAlgorithm,
            kemAlgorithm: securitySettings.kemAlgorithm,
            sigAlgorithm: securitySettings.sigAlgorithm,
            headerObfuscatorSettings: securitySettings.headerObfuscatorSettings,
            enrolPasskey: securitySettings.enrolPasskey,
          }}
          isFromLogin={true}
        />
      ) : (
        <Card className="bg-background border-border shadow-2xl shadow-black/40 w-full max-w-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={onCancel}
                variant="ghost"
                size="icon"
                aria-label="Back"
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary-accent/15 rounded-lg"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <div>
                <CitadelLogo variant="mark" height={30} className="mb-3" />
                <h2 className="text-xl font-bold text-foreground">Login to Workspace</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Enter your credentials to connect
                </p>
              </div>
            </div>
          </CardHeader>

          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4 max-h-[calc(100dvh-16rem)] overflow-y-auto">
              {/* Username */}
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    autoComplete="username"
                    aria-invalid={invalidField === 'username' ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-input border-border text-foreground pl-10 h-11 rounded-lg placeholder:text-muted-foreground focus:border-primary-accent focus:ring-1 focus:ring-ring/30 transition-all"
                  />
                </div>
              </div>

              {passkeyAccounts.length > 0 && (
                <PasskeySignIn accounts={passkeyAccounts} onUse={signInAs} disabled={loading} />
              )}

              {/* How the account is proved: password, key alone, or recovery code */}
              <LoginFactorFields h={h} keysHere={passkeysAvailableHere()} />
              {/* No Server Address field.
                  Signing in does not need one and never did: the SDK pins the
                  server in the account's CNAC at registration, and `connect`
                  takes no address at all. The field was collected, stored as
                  metadata, and never used to reach anything -- so a user who
                  typed the wrong address still signed in to wherever their
                  account lives, and a user whose account was somewhere else
                  waited out a 30s timeout with the box on screen implying it
                  was the thing to correct. Registration still asks, because
                  that is the one moment the address is genuinely needed. */}

              <LoginAdvancedOptions
                isOpen={isAdvancedOpen}
                onToggle={() => setIsAdvancedOpen(!isAdvancedOpen)}
                onConfigureSecurity={() => setShowSecuritySettings(true)}
                securitySettings={securitySettings}
                setSecuritySettings={setSecuritySettings}
                passkey={passkey}
              />

              {/* Error */}
              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="flex items-center gap-2 text-destructive-emphasis text-sm p-3 bg-destructive/10 rounded-lg border border-destructive/20"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
                  {error}
                </div>
              )}
            </CardContent>

            <CardFooter className="pt-2">
              <Button
                type="submit"
                data-testid="login-submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 rounded-lg shadow-lg shadow-primary-accent/20 transition-all gap-2"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    {mode === 'recovery' ? SIGN_IN_COPY.recoverySubmit : mode === 'key' ? 'Continue with security key' : 'Sign In'}
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
