/**
 * The sign-in that moves a session from another browser window to this one.
 *
 * The agent re-points a live session only for a Connect that proves the
 * password (connect.rs, credential_fingerprint); ClaimSession cannot. So
 * "Use it here" opens the ordinary sign-in form with the username filled in.
 * The form's SessionAlreadyActive path then claims and opens the workspace.
 */
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router';
import { Login } from './Login';
import { useToast } from '@/hooks/use-toast';
import { postAuthSetup } from '@/lib/post-auth-setup';
import { getWorkspacePath } from '@/lib/workspace-navigation';
import { toastError } from '@/lib/toast-helpers';
import { describeFailure } from '@/lib/failure-message';

interface TakeoverSignInProps {
  /** The account to sign in as, or null when nothing is being taken over. */
  username: string | null;
  onClose: () => void;
}

export function TakeoverSignIn({ username, onClose }: TakeoverSignInProps): JSX.Element | null {
  const navigate: NavigateFunction = useNavigate();
  const { toast } = useToast();
  if (username === null) return null;

  const finish = async (cid: string): Promise<void> => {
    onClose();
    try {
      await postAuthSetup(BigInt(cid));
      navigate(getWorkspacePath());
    } catch (error) {
      toastError(toast, 'Could not open the workspace', describeFailure(error, 'Sign in again to continue.'));
    }
  };

  return <Login initialUsername={username} onNext={(cid: string) => { void finish(cid); }} onCancel={onClose} />;
}
