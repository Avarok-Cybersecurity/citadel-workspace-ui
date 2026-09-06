import { useState, useCallback, useEffect } from 'react';
import { isOnboardingEnabled } from '@/lib/debug-config';
import { suppressInitPrompt } from '@/lib/workspace-init-prompt';
import { debugLog } from '@/lib/debug-config';
import { useServiceHealth } from '@/hooks/use-service-health';

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
  const { isHealthy } = useServiceHealth();

  // Not while the agent is unreachable.
  //
  // On the hosted UI this is the FIRST-RUN state, not an edge case: the page
  // loads from work.avarok.net, the agent runs on the visitor's own machine,
  // and until they install it `wss://local.avarok.net:12345` refuses. Verified
  // against production -- clicking "Create Account" there put the intent dialog
  // on screen underneath ConnectionRetryModal, with OfflineBanner saying the
  // same thing across the top. Three notices for one condition, two of them
  // modal, each trapping focus.
  //
  // The retry dialog is the one that must win: it alone carries the agent
  // download links and the command to run it. This question -- what will you
  // need to hand -- is premature when no account can be created yet, and it is
  // asked again the moment the agent answers.
  //
  // WorkspaceApp already declines to stack the retry dialog on OfflineBanner
  // for the DEVICE-offline case, with this same reasoning written next to it.
  // `isOnline` is not this condition: the agent is on localhost and can be dead
  // while the browser is perfectly online, which is exactly the hosted case.
  useEffect((): void => {
    if (!isHealthy) setOpen(false);
  }, [isHealthy]);

  const request: () => void = useCallback((): void => {
    if (isOnboardingEnabled() && isHealthy) {
      setOpen(true);
      return;
    }
    // Unreachable agent: do NOT fall through to the wizard. It would open on a
    // connection that cannot complete, on top of the dialog explaining why.
    if (!isHealthy) return;
    beginWizard();
  }, [beginWizard, isHealthy]);

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
