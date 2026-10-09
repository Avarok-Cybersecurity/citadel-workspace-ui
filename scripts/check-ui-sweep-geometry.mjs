/**
 * Measured layout for the quality sweep: people, overlays, spacing, touch reach, in a real browser engine.
 * Serves the real components (see lib/polish-harness) and asserts bounding boxes, in Chromium and WebKit,
 * light and dark, at desktop and phone widths.
 */
import { runChecks } from './lib/polish-harness/run-checks.mjs';
import { PEOPLE_CHECKS } from './lib/polish-harness/checks-people.mjs';
import { OVERLAY_CHECKS } from './lib/polish-harness/checks-overlays.mjs';

process.exit(await runChecks({ ...PEOPLE_CHECKS, ...OVERLAY_CHECKS }, Number(process.env.SWEEP_PORT ?? 4198)));
