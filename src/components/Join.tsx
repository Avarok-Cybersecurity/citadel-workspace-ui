import { useDialogOverlay } from '@/hooks/use-dialog-overlay';
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { StepIndicator } from "@/components/ui/step-indicator";
import { WorkspaceNotInitializedModal } from "./WorkspaceNotInitializedModal";
import { ConnectLoadingModal } from "./LoadingModal";
import { useJoinRegistration } from "./useJoinRegistration";
import { JoinFormFields } from "./JoinFormFields";

interface JoinProps {
  onNext: (cid: string) => void;
  onBack: () => void;
  defaultWorkspace?: string;
  serverAddress: string;
  serverPassword: string;
}

export const Join = ({ onNext: _onNext, onBack, defaultWorkspace, serverAddress, serverPassword }: JoinProps) => {
  const {
    formData,
    isRegistering,
    showNotInitializedModal,
    showConnectModal,
    connectStatus,
    handleInputChange,
    handleBlur,
    fieldErrors,
    handleSubmit,
    handleConnectModalComplete,
    handleReturnToLogin,
  } = useJoinRegistration(onBack, serverAddress, serverPassword);

  const { ref: dialogRef, dialogProps } = useDialogOverlay({ label: 'Create your profile', onDismiss: onBack });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" ref={dialogRef} {...dialogProps}>
      <div className="w-full max-w-md">
        <Card className="bg-background border-border shadow-2xl shadow-black/40">
          <CardHeader className="pb-4">
            <StepIndicator currentStep={3} totalSteps={3} labels={["Server", "Security", "Profile"]} />
            <h2 className="text-xl font-bold text-foreground mt-5">Create Your Profile</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {defaultWorkspace ? `Join ${defaultWorkspace} with a new account` : "Set up your identity for this workspace"}
            </p>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="max-h-[calc(100dvh-16rem)] overflow-y-auto">
              <JoinFormFields
                formData={formData}
                onChange={handleInputChange}
                onBlur={handleBlur}
                fieldErrors={fieldErrors}
              />
            </CardContent>

            <CardFooter className="flex justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                className="text-muted-foreground hover:text-foreground hover:bg-transparent"
                disabled={isRegistering}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-primary-foreground transition-all gap-2 px-5 rounded-lg shadow-lg shadow-primary-accent/20"
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    Join
                    <CheckCircle className="w-4 h-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <WorkspaceNotInitializedModal
        isOpen={showNotInitializedModal}
        onReturnToLogin={handleReturnToLogin}
      />

      <ConnectLoadingModal
        open={showConnectModal}
        status={connectStatus}
        username={formData.username}
        onComplete={handleConnectModalComplete}
      />
    </div>
  );
};
