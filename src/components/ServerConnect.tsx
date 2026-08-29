import { useDialogOverlay } from '@/hooks/use-dialog-overlay';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Globe, Lock, Shield, ArrowRight } from "lucide-react";
import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { StepIndicator } from "@/components/ui/step-indicator";

interface ServerConnectProps {
  onNext: (address: string, password: string) => void;
  /**
   * Required, with no navigation fallback.
   *
   * It was optional, and both Escape and Cancel fell back to `navigate('/')`.
   * WorkspaceSwitcher renders this inside a Radix Dialog without passing it, so
   * pressing Escape — the standard way to close a dialog — closed the dialog AND
   * threw the user out of their workspace to the Landing page. Making it
   * required means a caller has to say what dismissing means to them.
   */
  onCancel: () => void;
  defaultServer?: string;
  title?: string;
  initialAddress?: string;
  initialPassword?: string;
}

export const ServerConnect = ({ onNext, onCancel, defaultServer, title, initialAddress, initialPassword }: ServerConnectProps) => {
  const { toast } = useToast();

  const [serverAddress, setServerAddress] = useState(defaultServer || initialAddress || '');
  const [password, setPassword] = useState(initialPassword || '');

  const handleConnect = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!serverAddress) {
      toast({
        title: "Server address required",
        description: "Please enter a server address to connect",
        variant: "destructive",
      });
      return;
    }

    // Basic server address validation — must look like a hostname or IP
    const trimmed: string = serverAddress.trim();
    if (!trimmed.includes('.') && !trimmed.includes(':')) {
      toast({
        title: "Invalid server address",
        description: "Please enter a valid server address (e.g., workspace.avarok.net or 127.0.0.1:8080)",
        variant: "destructive",
      });
      return;
    }

    onNext(serverAddress, password);
  };

  const { ref: dialogRef, dialogProps } = useDialogOverlay({ label: 'Connect to a server', onDismiss: onCancel });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" ref={dialogRef} {...dialogProps}>
      <div className="w-full max-w-md">
        <Card className="bg-background border-border shadow-2xl shadow-black/40">
          <CardHeader className="pb-4">
            {/* "Workspace", not "Server": the field below is labelled
                Workspace Address, and a step indicator that names a different
                thing from the field it introduces makes the user wonder which
                one they are being asked for. */}
            <StepIndicator currentStep={1} totalSteps={3} labels={["Workspace", "Security", "Profile"]} />
            <h2 className="text-xl font-bold text-foreground mt-5">{title || "Create Account"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {defaultServer ? "Connect with a different account" : "Enter workspace details to get started"}
            </p>
          </CardHeader>

          <form onSubmit={handleConnect}>
            <CardContent className="space-y-5 max-h-[calc(100dvh-16rem)] overflow-y-auto">
              {/* Workspace Address */}
              <div className="space-y-2">
                <label htmlFor="serverAddress" className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Workspace Address
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="serverAddress"
                    value={serverAddress}
                    onChange={(e) => setServerAddress(e.target.value)}
                    className="bg-input border-border text-foreground pl-10 h-11 rounded-lg placeholder:text-muted-foreground focus:border-primary-accent focus:ring-1 focus:ring-ring/30 transition-all"
                    placeholder="workspace.example.com"
                  />
                </div>
              </div>

              {/* Workspace Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Workspace Password (Optional)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-input border-border text-foreground pl-10 h-11 rounded-lg placeholder:text-muted-foreground focus:border-primary-accent focus:ring-1 focus:ring-ring/30 transition-all"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              {/* Security info banner */}
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-primary-accent/5 border border-primary-accent/10">
                <Shield className="w-4 h-4 text-primary-accent flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Citadel uses <span className="text-primary-accent">lattice-based cryptography</span>. All connections are
                  end-to-end encrypted and resistant to quantum compute attacks.
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                className="text-muted-foreground hover:text-foreground hover:bg-transparent"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="wizard-next"
                className="bg-primary hover:bg-primary/90 text-primary-foreground transition-all gap-2 px-5 rounded-lg shadow-lg shadow-primary-accent/20"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};
