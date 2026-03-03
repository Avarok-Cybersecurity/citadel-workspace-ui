import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Settings, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SecuritySettings, SecuritySettingsValues } from "./SecuritySettings";
import { useLoginHandler } from "./useLoginHandler";

interface LoginProps {
  onNext: (connectionId: string) => void;
  onCancel: () => void;
}

export function Login({ onNext, onCancel }: LoginProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);

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
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4">
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
        <Card className="bg-[#282A42] border-[#3D3F5A] shadow-lg w-full max-w-md">
          <CardHeader>
            <div className="flex items-center">
              <Button
                onClick={onCancel}
                variant="ghost"
                size="icon"
                className="h-8 w-8 mr-2 text-gray-300 hover:text-white hover:bg-purple-500/20"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <CardTitle className="text-white text-xl">Login to Workspace</CardTitle>
                <CardDescription className="text-gray-300">
                  Enter your credentials to connect to a workspace
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-scroll">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">Username</Label>
                <Input
                  id="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="server" className="text-gray-300">Server Address</Label>
                <Input
                  id="server"
                  placeholder="workspace.example.com:12349"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  className="bg-[#3B3D57] border-[#4D4F6C] text-white"
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start p-0 text-purple-400 hover:text-purple-300 hover:bg-transparent"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Advanced Options
              </Button>

              {isAdvancedOpen && (
                <div className="space-y-4 p-3 bg-[#343650] rounded-md overflow-y-auto max-h-96">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="quick-security" className="text-gray-300 cursor-pointer">
                      Configure Security Settings
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-purple-500 text-purple-400 hover:bg-purple-500/20"
                      onClick={() => setShowSecuritySettings(true)}
                    >
                      Configure
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="remember" className="text-gray-300 cursor-pointer">
                      Remember Credentials
                    </Label>
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

              {error && (
                <div className="text-red-400 text-sm p-2 bg-red-400/10 rounded border border-red-400/20">
                  {error}
                </div>
              )}
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
