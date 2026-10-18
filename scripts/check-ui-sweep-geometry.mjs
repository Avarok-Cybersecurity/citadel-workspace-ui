/**
 * Measured layout for the quality sweep: people, overlays, spacing, touch reach, in a real browser engine.
 * The focused sidebar's rows, ARIA and motion (a selection must glide, not jump) are measured here too,
 * and every permission editor's ticks sit in the middle of their boxes. The file manager is measured in
 * each state it draws: list, grid, inspector, bulk bar, transfers, empty, a deep path and its context menu The header's breadcrumbs fit their bar. The share dialog fits a 375px phone, its link and Copy both visible.
 * The Citadel Docs ribbon passes axe on every tab and collapsed group, keeps 44px targets, and never widens the page.
 * Serves the real components (see lib/polish-harness) and asserts bounding boxes, in Chromium and WebKit,
 * light and dark, at desktop and phone widths.
 */
import { runChecks } from './lib/polish-harness/run-checks.mjs';
import { PEOPLE_CHECKS } from './lib/polish-harness/checks-people.mjs';
import { OVERLAY_CHECKS } from './lib/polish-harness/checks-overlays.mjs';
import { SPACING_CHECKS } from './lib/polish-harness/checks-spacing.mjs';
import { CONTROL_CHECKS } from './lib/polish-harness/checks-controls.mjs';
import { SIDEBAR_CHECKS } from './lib/polish-harness/checks-sidebar.mjs';
import { PERMISSION_CHECKS } from './lib/polish-harness/checks-permissions.mjs';
import { FILE_MANAGER_CHECKS } from './lib/polish-harness/checks-file-manager.mjs';
import { BREADCRUMB_CHECKS } from './lib/polish-harness/checks-breadcrumbs.mjs';
import { RIBBON_CHECKS } from './lib/polish-harness/checks-ribbons.mjs';
import { SHARE_CHECKS } from './lib/polish-harness/checks-share.mjs';

process.exit(await runChecks({ ...PEOPLE_CHECKS, ...OVERLAY_CHECKS, ...CONTROL_CHECKS, ...SPACING_CHECKS, ...SIDEBAR_CHECKS, ...PERMISSION_CHECKS, ...FILE_MANAGER_CHECKS, ...BREADCRUMB_CHECKS, ...RIBBON_CHECKS, ...SHARE_CHECKS }, Number(process.env.SWEEP_PORT ?? 4198)));
