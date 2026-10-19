/**
 * Testids an element CHOOSES by an expression: `OfflineBanner.tsx` renders one of five with a
 * ternary, `data-testid={reconnecting ? 'server-reconnecting-banner' : …}`. Each quoted literal
 * in the braces is an id the element renders in one of its states; such a choice nests no
 * braces. Shared by the gates that ask whether a testid exists, so they agree on what does.
 */
export function chosenTestIds(source) {
  const ids = [];
  for (const m of source.matchAll(/data-testid=\{([^{}`]*)\}/g)) {
    for (const lit of m[1].matchAll(/["']([A-Za-z0-9_-]+)["']/g)) ids.push(lit[1]);
  }
  return ids;
}
