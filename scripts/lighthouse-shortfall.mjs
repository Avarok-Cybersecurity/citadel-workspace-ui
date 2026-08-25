/**
 * The one shortfall CI is allowed, and only when it is exactly this.
 *
 * Lighthouse audits the bundle with no agent behind the `/ws` proxy, and the
 * app reports that failure three times as it propagates — so `errors-in-console`
 * fails and best-practices lands on 93 against a 95 floor, permanently. That is
 * not a regression signal, and a gate that can never pass is one people learn to
 * ignore.
 *
 * Lowering the floor would hide the next real best-practices problem too, so
 * instead the shortfall is accepted ONLY when every failing audit is this one
 * AND every message it carries is the connection failure we expect. A new audit
 * appearing, or a console error that is not the agent being absent, still fails.
 *
 * Not artificial, incidentally: the deployed UI deliberately never proxies the
 * agent, so this is what a user sees before starting their own.
 */
export const EXPECTED_CONSOLE_ERROR = /WebSocket connection failed|Failed to initialize WASM client|WorkspaceClient/i;

export function shortfallIsOnlyTheAbsentAgent(category, audits) {
  const failing = (category.auditRefs ?? [])
    .map((ref) => audits[ref.id])
    .filter((a) => a && a.score !== null && a.score < 1);
  if (failing.length === 0) return false;
  if (!failing.every((a) => a.id === 'errors-in-console')) return false;

  const messages = failing.flatMap((a) =>
    (a.details?.items ?? []).map((i) => String(i.description ?? i.errorMessage ?? '')),
  );
  return messages.length > 0 && messages.every((m) => EXPECTED_CONSOLE_ERROR.test(m));
}

