import { useState, useCallback } from 'react';
import { isOnboardingEnabled } from '@/lib/debug-config';
import { suppressInitPrompt } from '@/lib/workspace-init-prompt';
import { debugLog } from '@/lib/debug-config';

/** What the user said they were doing. `undefined` means they dismissed without saying. */
export type OnboardingChoice = 'admin' | 'member' | undefined;

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
  /**
   * Dismiss or choose. The wizard proceeds identically either way — the answer
   * does not branch registration — but it is not discarded: see below.
   */
  resolve: (choice?: OnboardingChoice) => void;
}

export function useOnboardingIntent(beginWizard: () => void): OnboardingIntentState {
  const [open, setOpen] = useState(false);

  const request: () => void = useCallback((): void => {
    if (isOnboardingEnabled()) {
      setOpen(true);
      return;
    }
    beginWizard();
  }, [beginWizard]);

  const resolve: (choice?: OnboardingChoice) => void = useCallback((choice?: OnboardingChoice): void => {
    setOpen(false);
    // "Joining a workspace someone else set up" is the user telling us, in as
    // many words, that they do not hold WORKSPACE_MASTER_PASSWORD. The dialog's
    // own copy promises them they "should not be asked for it" -- and until now
    // the answer was discarded, so they were asked anyway, by a modal that
    // appears AFTER the account exists and is shown to every user until someone
    // completes it.
    //
    // This is the SAME suppression dismissing that modal already performs, and
    // it is scoped to the tab session for the same reason, so it grants no new
    // state and no lasting one. It cannot strand a workspace: nothing actually
    // requires initialization, since the root is seeded at boot and Admin is
    // granted at connect to the first member.
    //
    // Only `member` suppresses. `admin` has been told to have the password to
    // hand and SHOULD be prompted; dismissing without answering says nothing,
    // and is left exactly as it was.
    if (choice === 'member' && !suppressInitPrompt()) {
      // Storage refused (private mode, blocked site data). The prompt will still
      // appear; say so, because the alternative is a member being asked for a
      // secret they cannot have with nothing anywhere explaining why.
      debugLog(
        'OnboardingIntent',
        'Could not record "joining a workspace": session storage is unavailable, so the ' +
          'workspace-initialization prompt will still be shown.',
      );
    }
    beginWizard();
  }, [beginWizard]);

  return { open, request, resolve };
}
