/**
 * What the join form renders and submits with.
 *
 * Its own module because `useJoinRegistration` is at the file-length cap and
 * this is the half a reader wants first: the hook is two hundred lines of flow,
 * and its contract with the form is twelve.
 */

import type { JoinFormData } from './useJoinRegistration';
import type { ConnectStatus } from './LoadingModalConfigs';
import type { JoinFieldErrorsResult } from './join-field-errors';

export interface JoinRegistration {
  formData: JoinFormData;
  isRegistering: boolean;
  showNotInitializedModal: boolean;
  showConnectModal: boolean;
  connectStatus: ConnectStatus;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Per-field messages, shown only once a field has been touched or submitted. */
  fieldErrors: JoinFieldErrorsResult['fieldErrors'];
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleConnectModalComplete: () => void;
  handleReturnToLogin: () => void;
}
