import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useDialogOverlay } from '@/hooks/use-dialog-overlay';
import { stringToBytes } from '@/lib/utils/encoding-utils';
import { SIGN_IN_COPY } from '@/lib/sign-in/copy';
import { tenantOf } from '@/lib/sign-in/factors';
import type { AccountRef } from '@/lib/sign-in/types';
import { AddSecurityKeyCard } from './AddSecurityKeyCard';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';

type Step = 'key' | 'codes';

/**
 * Right after an account is created: an optional security key, then the
 * recovery codes, shown once.
 *
 * Keys are enrolled after registration (the agent and the SDK enrol them into
 * a live session), so this runs once the account is signed in. A server
 * without post-quantum sign-in sends no recovery codes and cannot enrol a key;
 * then there is nothing to show and the workspace opens as before.
 */
export function PostRegistrationSteps({ cid, username, serverAddress, password, recoveryCodes, onDone }: {
  cid: bigint;
  username: string;
  serverAddress: string;
  /** The password just chosen: the step-up for the new account's first key. */
  password: string;
  recoveryCodes: readonly string[];
  onDone: () => void;
}): JSX.Element | null {
  const [step, setStep] = useState<Step>('key');
  const supported: boolean = recoveryCodes.length > 0;
  const { ref, dialogProps } = useDialogOverlay({ label: 'Secure your account' });

  // Once: the caller's onDone opens the workspace, and a re-render must not open it again.
  const finished: React.MutableRefObject<boolean> = useRef<boolean>(false);
  useEffect(() => {
    if (supported || finished.current) return;
    finished.current = true;
    onDone();
  }, [supported, onDone]);
  if (!supported) return null;

  const account: AccountRef = { tenant: tenantOf(serverAddress), cid, username };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" ref={ref} {...dialogProps}>
      <Card className="bg-background border-border shadow-2xl shadow-black/40 w-full max-w-md" data-testid="post-registration">
        <CardContent className="pt-6">
          {step === 'key' ? (
            <AddSecurityKeyCard
              account={account}
              stepUp={{ password: stringToBytes(password), security_key: true }}
              title={SIGN_IN_COPY.addKeyTitle}
              body={SIGN_IN_COPY.addKeyBody}
              onFinished={() => setStep('codes')}
            />
          ) : (
            <RecoveryCodesPanel codes={recoveryCodes} account={username} onDone={onDone} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
