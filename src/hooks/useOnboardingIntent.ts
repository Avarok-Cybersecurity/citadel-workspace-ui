import { useState, useCallback } from 'react';
import { isOnboardingEnabled } from '@/lib/debug-config';

/**
 * Whether to ask "new workspace or joining one?" before the registration wizard.
 *
 * Extracted from Landing rather than inlined there: Landing.tsx is one of the
 * files held at a fixed length by scripts/check-file-length.mjs, and that
 * exemption is a ceiling rather than a licence to keep growing. The state is
 * small but the reasoning around it is not, and it belongs next to the gate it
 * consults.
 *
 * `open` is always false in development, because `isOnboardingEnabled` is --
 * so the integration suite's ~90 account creations never see this dialog and
 * never pay the two extra interactions it costs.
 */
export interface OnboardingIntentState {
  /** Whether the intent dialog is showing. Always false in development. */
  open: boolean;
  /** Call in place of starting the wizard directly. */
  request: () => void;
  /** Dismiss or choose; either way the wizard proceeds unchanged. */
  resolve: () => void;
}

export function useOnboardingIntent(beginWizard: () => void): OnboardingIntentState {
  const [open, setOpen] = useState(false);

  const request = useCallback((): void => {
    if (isOnboardingEnabled()) {
      setOpen(true);
      return;
    }
    beginWizard();
  }, [beginWizard]);

  const resolve = useCallback((): void => {
    setOpen(false);
    beginWizard();
  }, [beginWizard]);

  return { open, request, resolve };
}
