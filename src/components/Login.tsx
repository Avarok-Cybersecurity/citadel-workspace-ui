import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ChevronLeft, ChevronDown, Settings, Loader2, Eye, EyeOff, User, Lock, Globe, LogIn } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SecuritySettings, SecuritySettingsValues } from "./SecuritySettings";
import { useLoginHandler } from "./useLoginHandler";
import { cn } from "@/lib/utils";

interface LoginProps {
  onNext: (connectionId: string) => void;
  onCancel: () => void;
}

export function Login({ onNext, onCancel }: LoginProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const {
    username,
    setUsername,
    password,
    setPassword,
    server,
    setServer,
    error,
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

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
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
            <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
              {/* Username */}
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-input border-border text-foreground pl-10 h-11 rounded-lg placeholder:text-muted-foreground focus:border-primary-accent focus:ring-1 focus:ring-ring/30 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-input border-border text-foreground pl-10 pr-10 h-11 rounded-lg placeholder:text-muted-foreground focus:border-primary-accent focus:ring-1 focus:ring-ring/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    // The icon stays 16px; the BUTTON is 24px, the WCAG 2.2
                    // target-size floor. Centring the icon inside keeps the
                    // position identical while the thumb gets something to aim
                    // at. `right-3` becomes right-2 to keep the visual inset
                    // once the box grew.
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground/80 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                      : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* Server Address */}
              <div className="space-y-1.5">
                <label htmlFor="server" className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Server Address
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="server"
                    placeholder="workspace.example.com:12349"
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    className="bg-input border-border text-foreground pl-10 h-11 rounded-lg placeholder:text-muted-foreground focus:border-primary-accent focus:ring-1 focus:ring-ring/30 transition-all"
                  />
                </div>
              </div>

              {/* Advanced Options */}
              <button
                type="button"
                className="flex items-center gap-2 text-muted-foreground w-full transition-colors duration-200 hover:text-primary-accent py-1"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold tracking-wider uppercase">Advanced Options</span>
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200 ml-auto", isAdvancedOpen && "rotate-180")} />
              </button>

              {isAdvancedOpen && (
                <div className="space-y-3 p-3 bg-input rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                      Security Settings
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-primary-accent/50 text-primary-accent hover:bg-primary-accent/15 hover:text-foreground text-xs h-7 px-3 rounded-md"
                      onClick={() => setShowSecuritySettings(true)}
                    >
                      Configure
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="remember"
                      className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground cursor-pointer"
                    >
                      Remember Credentials
                    </label>
                    <Switch
                      id="remember"
                      checked={securitySettings.storeCredentials}
                      onCheckedChange={(checked) => setSecuritySettings({
                        ...securitySettings,
                        storeCredentials: checked
                      })}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg border border-destructive/20">
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
                    Connecting...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Connect
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
