import { ServerConnect } from "@/components/ServerConnect";
import { SecuritySettings, type SecuritySettingsValues } from "@/components/SecuritySettings";
import { Join } from "@/components/Join";
import { Login } from "@/components/Login";
import type { JoinFormData } from "@/components/useJoinRegistration";

/**
 * The registration and login overlays, by step.
 *
 * Split out of `Landing.tsx` when that file - already carrying a length
 * exemption - grew past it again. An exact piecewise move: the markup is
 * unchanged and every value it uses arrives as a prop, so this decides nothing
 * that the page did not decide before.
 */
export interface LandingStepsProps {
  currentStep: 'none' | 'server' | 'security' | 'join' | 'login';
  setCurrentStep: (step: 'none' | 'server' | 'security' | 'join' | 'login') => void;
  serverAddress: string;
  serverPassword: string;
  securitySettings: SecuritySettingsValues;
  profileDraft: JoinFormData;
  setProfileDraft: (next: JoinFormData) => void;
  handleServerNext: (address: string, password: string) => void;
  handleSecurityBack: () => void;
  handleSecurityComplete: (chosen: SecuritySettingsValues) => void;
  handleJoinNext: (cid: string) => void;
  handleJoinBack: () => void;
  handleLoginNext: (cid: string) => void;
}

export function LandingSteps({
  currentStep,
  setCurrentStep,
  serverAddress,
  serverPassword,
  securitySettings,
  profileDraft,
  setProfileDraft,
  handleServerNext,
  handleSecurityBack,
  handleSecurityComplete,
  handleJoinNext,
  handleJoinBack,
  handleLoginNext,
}: LandingStepsProps): JSX.Element {
  return (
    <>
      {currentStep === 'server' && (
        <ServerConnect
          onNext={handleServerNext}
          onCancel={() => setCurrentStep('none')}
          initialAddress={serverAddress}
          initialPassword={serverPassword}
        />
      )}
      {currentStep === 'security' && (
        <SecuritySettings
          onNext={() => setCurrentStep('join')}
          onBack={handleSecurityBack}
          onComplete={handleSecurityComplete}
          initialValues={securitySettings}
        />
      )}
      {currentStep === 'join' && (
        <Join
          onNext={handleJoinNext}
          onBack={handleJoinBack}
          serverAddress={serverAddress}
          serverPassword={serverPassword}
          securitySettings={securitySettings}
          profileDraft={{ initial: profileDraft, onChange: setProfileDraft }}
        />
      )}
      {currentStep === 'login' && (
        <Login onNext={handleLoginNext} onCancel={() => setCurrentStep('none')} />
      )}

    </>
  );
}
