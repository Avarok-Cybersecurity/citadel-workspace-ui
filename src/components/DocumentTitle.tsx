import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Keeps the browser tab title in step with the route.
 *
 * index.html sets one title and nothing ever changed it, so all seven routes
 * rendered as "Citadel Workspace — Post-Quantum Secure Collaboration". axe
 * cannot report that: a title IS present, and each scan only ever sees one
 * route. What it costs is real — a screen reader announces the same page name
 * wherever you navigate (WCAG 2.4.2), every history entry looks identical, and
 * the installed app's window carries one label for the whole product.
 *
 * One map rather than a hook call in each page: the pages are lazily loaded and
 * a missed one fails silently, leaving the previous route's title in place.
 */
const SUFFIX = 'Citadel Workspace';

/** First match wins, so put specific paths before their prefixes. */
const ROUTE_TITLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/$/, 'Citadel Workspace — Post-Quantum Secure Collaboration'],
  [/^\/connect(\/|$)/, `Connect · ${SUFFIX}`],
  [/^\/workspace(\/|$)/, `Workspace · ${SUFFIX}`],
  [/^\/messages(\/|$)/, `Messages · ${SUFFIX}`],
  [/^\/directory(\/|$)/, `Directory · ${SUFFIX}`],
  [/^\/groups\//, `Group chat · ${SUFFIX}`],
];

/** Exported for the test, and so the NotFound copy has one home. */
export function titleForPath(pathname: string): string {
  const match: readonly [RegExp, string] | undefined = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname));
  return match ? match[1] : `Page not found · ${SUFFIX}`;
}

export function DocumentTitle(): null {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);

  return null;
}
