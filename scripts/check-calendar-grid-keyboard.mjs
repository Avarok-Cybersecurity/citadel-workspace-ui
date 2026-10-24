/**
 * The Calendar's grids and views in a real browser engine (design §3.10): every day reachable by
 * keyboard through one roving tab stop, each view laid out at 375px and on a desktop with 44px
 * targets and no sideways scroll, and axe clean at rest; and the tab mounted whole, with each panel
 * it opens (the event editor, a member's booking page and its setup), held to the same. jsdom has no layout and no real focus
 * order, so none of this is visible to the unit tests. Serves the real components and the shipped
 * engine through lib/polish-harness.
 */
import { runChecks } from './lib/polish-harness/run-checks.mjs';
import { CALENDAR_CHECKS } from './lib/polish-harness/checks-calendar.mjs';
import { CALENDAR_PANEL_CHECKS } from './lib/polish-harness/checks-calendar-panels.mjs';

process.exit(await runChecks({ ...CALENDAR_CHECKS, ...CALENDAR_PANEL_CHECKS }, Number(process.env.CALENDAR_HARNESS_PORT ?? 4203)));
