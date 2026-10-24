/**
 * The Calendar's grids and views in a real browser engine (design §3.10): every day reachable by
 * keyboard through one roving tab stop, each view laid out at 375px and on a desktop with 44px
 * targets and no sideways scroll, and axe clean at rest. jsdom has no layout and no real focus
 * order, so none of this is visible to the unit tests. Serves the real components and the shipped
 * engine through lib/polish-harness.
 */
import { runChecks } from './lib/polish-harness/run-checks.mjs';
import { CALENDAR_CHECKS } from './lib/polish-harness/checks-calendar.mjs';

process.exit(await runChecks(CALENDAR_CHECKS, Number(process.env.CALENDAR_HARNESS_PORT ?? 4203)));
