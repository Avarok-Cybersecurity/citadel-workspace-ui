import { useDialogOverlay } from '@/hooks/use-dialog-overlay';
import { LoginAdvancedOptions } from "./LoginAdvancedOptions";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ChevronLeft, Loader2, Eye, EyeOff, User, Lock, LogIn } from "lucide-react";
import { SecuritySettings, SecuritySettingsValues } from "./SecuritySettings";
import { useLoginHandler } from "./useLoginHandler";

interface LoginProps {
  onNext: (connectionId: string) => void;
  onCancel: () => void;
}

export function Login({ onNext, onCancel }: LoginProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    username,
    setUsername,
    password,
    setPassword,
    error,
    invalidField,
    loading,
    securitySettings,
    setSecuritySettings,
    handleLogin,
  } = useLoginHandler({ onNext });

  const handleSecuritySettingsComplete = (values: SecuritySettingsValues) => {
    setSecuritySettings({
      securityLevel: values.securityLevel,
      secrecyMode: values.secrecyMode,
      encryptionAlgorithm: values.encryptionAlgorithm,
      kemAlgorithm: values.kemAlgorithm,
      sigAlgorithm: values.sigAlgorithm,
      headerObfuscatorSettings: values.headerObfuscatorSettings,
      storeCredentials: values.storeCredentials ?? false,
    });
  };

  const { ref: dialogRef, dialogProps } = useDialogOverlay({
    label: 'Sign in',
    onDismiss: onCancel,
    // SecuritySettings brings its own dialog treatment when shown.
    enabled: !showSecuritySettings,
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4" ref={dialogRef} {...dialogProps}>
      {showSecuritySettings ? (
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
            storeCredentials: securitySettings.storeCredentials,
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

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    aria-invalid={invalidField === 'password' ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-input border-border text-foreground pl-10 pr-10 h-11 rounded-lg placeholder:text-muted-foreground focus:border-primary-accent focus:ring-1 focus:ring-ring/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    // The name says what the control is; aria-pressed below says whether it
                  // is on. Flipping both made them contradict -- "Hide password,
                  // pressed" announces as hidden while the password is on screen.
                  aria-label="Show password"
                    aria-pressed={showPassword}
                    // The icon stays 16px; the BUTTON is 24px, the WCAG 2.2
                    // target-size floor. Centring the icon inside keeps the
                    // position identical while the thumb gets something to aim
                    // at. `right-3` becomes right-2 to keep the visual inset
                    // once the box grew.
                    className="tap-target absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground/80 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                      : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

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
                    Sign In
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
