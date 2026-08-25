/**
 * The best-practices shortfall CI is allowed, and only when it is exactly this.
 *
 * Lighthouse audits the bundle with no agent behind the `/ws` proxy, so two
 * audits fail every run and best-practices lands on 93 against a 95 floor,
 * permanently:
 *
 *   errors-in-console  the WASM client cannot open its socket, reported once
 *                      per layer as the failure propagates. Not an artificial
 *                      state: the deployed UI never proxies the agent, so this
 *                      is what someone sees before starting their own, and the
 *                      app handles it with a Connection Failed dialog.
 *   inspector-issues   cbor-x probes for `new Function` inside a try/catch and
 *                      falls back to its interpreted path when the policy
 *                      refuses. Chrome logs the refusal anyway. Allowing
 *                      'unsafe-eval' to silence it would trade a real security
 *                      boundary for a quieter report.
 *
 * Neither is a regression signal, and a gate that can never pass is one people
 * learn to re-run without reading. Lowering the floor to 93 would have hidden
 * the next real best-practices problem too, so the shortfall is accepted only
 * when EVERY failing audit is one of these two AND its contents are what we
 * expect. A third audit, a console error that is not the absent agent, or an
 * inspector issue that is not the policy, still fails the build.
 *
 * Accepting CSP issues here is not a hole: check-production-image.mjs gates
 * them precisely against the real nginx policy, failing on every violation
 * type except the eval probe. That is the authority for CSP, not this.
 */
const EXPECTED_CONSOLE_ERROR = /WebSocket connection failed|Failed to initialize WASM client|WorkspaceClient/i;

export function shortfallIsExpected(category, audits) {
  const failing = (category.auditRefs ?? [])
    .map((ref) => audits[ref.id])
    .filter((a) => a && a.score !== null && a.score < 1);
  if (failing.length === 0) return false;
  if (!failing.every((a) => a.id === 'errors-in-console' || a.id === 'inspector-issues')) {
    return false;
  }

  for (const audit of failing) {
    const items = audit.details?.items ?? [];
    // An audit that fails while telling us nothing cannot be recognised, so it
    // is not excused.
    if (items.length === 0) return false;

    if (audit.id === 'errors-in-console') {
      const messages = items.map((i) => String(i.description ?? i.errorMessage ?? ''));
      if (!messages.every((m) => EXPECTED_CONSOLE_ERROR.test(m))) return false;
    } else {
      if (!items.every((i) => /content security policy/i.test(String(i.issueType ?? '')))) {
        return false;
      }
    }
  }
  return true;
}

