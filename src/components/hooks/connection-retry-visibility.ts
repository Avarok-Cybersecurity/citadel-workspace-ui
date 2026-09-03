/**
 * Whether the connection-retry dialog should be on screen.
 *
 * `connection-failure` is emitted every time the WASM client fails to open its
 * socket, and with the agent down it retries — so the dialog reopened within a
 * second or two of every dismissal, indefinitely. Measured against a build
 * pointed at a dead port: Escape closes it, and it is back before the next
 * check. There is no way to put it away.
 *
 * `WorkspaceApp` already reached this conclusion for the other half of the same
 * condition. Its comment on suppressing the dialog while the browser reports no
 * network reads: *"two notices for one condition, and the blocking one adds
 * nothing… counting down retries that cannot succeed."* The agent being down is
 * the same situation with a different cause, and the offline banner has an
 * agent-down state saying so across the top of the app.
 *
 * So a dismissal sticks until something changes. A CONNECTION SUCCEEDING is the
 * change: after that, a new failure is genuinely new and worth interrupting for.
 * Repeated failures from the outage the user already dismissed are not.
 *
 * Pure, so the rule is testable without a socket, a timer or a dialog.
 */
export interface RetryVisibility {
  /** True once a failure has been seen and not yet superseded. */
  failing: boolean;
  /** True while the user's dismissal still stands. */
  dismissed: boolean;
}

export const NOT_FAILING: RetryVisibility = { failing: false, dismissed: false };

/** A failure arrived. It does not un-dismiss what the user put away. */
export function onFailure(state: RetryVisibility): RetryVisibility {
  return { failing: true, dismissed: state.dismissed };
}

/** The user dismissed the dialog. */
export function onDismiss(state: RetryVisibility): RetryVisibility {
  return { failing: state.failing, dismissed: true };
}

/**
 * A connection succeeded. Clears both, so the NEXT failure is interrupting
 * again — the dismissal was about one outage, not about the feature.
 */
export function onSuccess(): RetryVisibility {
  return NOT_FAILING;
}

export function isRetryDialogOpen(state: RetryVisibility): boolean {
  return state.failing && !state.dismissed;
}
