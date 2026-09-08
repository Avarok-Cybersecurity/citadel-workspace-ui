import { CitadelLogo } from '@/components/brand/CitadelLogo';
import { useDialogOverlay } from '@/hooks/use-dialog-overlay';
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { StepIndicator } from "@/components/ui/step-indicator";
import { WorkspaceNotInitializedModal } from "./WorkspaceNotInitializedModal";
import { ConnectLoadingModal } from "./LoadingModal";
import { useJoinRegistration, type JoinFormData } from "./useJoinRegistration";
import type { SecuritySettingsValues } from "./SecuritySettings";
import { JoinFormFields } from "./JoinFormFields";

interface JoinProps {
  onNext: (cid: string) => void;
  onBack: () => void;
  defaultWorkspace?: string;
  serverAddress: string;
  serverPassword: string;
  securitySettings?: SecuritySettingsValues;
  /** Kept by the caller, so stepping Back does not discard what was typed. */
  profileDraft?: { initial: JoinFormData; onChange: (next: JoinFormData) => void };
}

export const Join = ({ onNext: _onNext, onBack, defaultWorkspace, serverAddress, serverPassword, securitySettings, profileDraft }: JoinProps): JSX.Element => {
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
  } = useJoinRegistration(onBack, serverAddress, serverPassword, securitySettings, profileDraft);

  /**
   * Delegated while a nested dialog is up, exactly as Login already does for
   * SecuritySettings ("SecuritySettings brings its own dialog treatment when
   * shown", Login.tsx:49). Join nests TWO dialogs inside its own scrim -- the
   * connect progress modal and the not-initialized notice -- and delegated to
   * neither, so each of them arrived alongside a SECOND live focus trap and a
   * second document-level Escape handler, with `role="dialog" aria-modal="true"`
   * asserted twice at once. The fix existed; it was never carried here.
   */
  const nestedDialogOpen: boolean = showNotInitializedModal || showConnectModal;
  const { ref: dialogRef, dialogProps } = useDialogOverlay({
    label: 'Create your profile',
    onDismiss: onBack,
    enabled: !nestedDialogOpen,
  });

  /**
   * The wizard is finished when this notice appears, so the wizard stops being
   * drawn.
   *
   * Registration was refused because the workspace has no administrator yet;
   * the only action left is the notice's own "Return to Login". Rendering the
   * form behind it stacked two scrims and left a second dialog card
   * visible-but-blurred underneath the one being read -- which is alarming on
   * its own, and makes the message on top easy to take for a glitch.
   */
  if (showNotInitializedModal) {
    return (
      <WorkspaceNotInitializedModal isOpen onReturnToLogin={handleReturnToLogin} />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" ref={dialogRef} {...dialogProps}>
      <div className="w-full max-w-md">
        <Card className="bg-background border-border shadow-2xl shadow-black/40">
          <CardHeader className="pb-4">
            <CitadelLogo variant="mark" height={34} className="mb-4" />
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
                data-testid="join-submit"
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

      <ConnectLoadingModal
        open={showConnectModal}
        status={connectStatus}
        username={formData.username}
        onComplete={handleConnectModalComplete}
        onCancel={handleConnectModalComplete}
      />
    </div>
  );
};
