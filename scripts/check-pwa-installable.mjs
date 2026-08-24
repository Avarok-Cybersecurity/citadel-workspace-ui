/**
 * Fails the build if the app would stop being installable.
 *
 * The install button in the URL bar is not something the app draws — the browser
 * offers it only when a set of conditions is met, and if one quietly breaks the
 * button simply never appears again. Nothing errors, nothing logs, and the only
 * symptom is an affordance that used to be there.
 *
 * The manifest is checked against the built artefact rather than a served URL on
 * purpose: in dev, `/manifest.webmanifest` returns 200 with the SPA fallback
 * HTML, so a fetch-based check would pass while validating a web page.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

// --- Service worker ---------------------------------------------------------
check(existsSync(join(dist, 'sw.js')), 'dist/sw.js is missing — the app cannot work offline or update.');

// --- Manifest ---------------------------------------------------------------
const manifestPath = join(dist, 'manifest.webmanifest');
if (!existsSync(manifestPath)) {
  console.error('dist/manifest.webmanifest is missing — the browser cannot offer to install the app.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// The fields Chrome actually requires before it will show the install prompt.
check(!!manifest.name, 'manifest.name is missing.');
check(!!manifest.short_name, 'manifest.short_name is missing — used under the home-screen icon.');
check(!!manifest.start_url, 'manifest.start_url is missing.');
check(
  ['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display),
  `manifest.display is "${manifest.display}" — "browser" is not installable.`
);

// --- Icons ------------------------------------------------------------------
const icons = manifest.icons ?? [];
const hasSize = (size) => icons.some((i) => (i.sizes ?? '').split(' ').includes(`${size}x${size}`));
check(hasSize(192), 'No 192x192 icon — Chrome requires one to offer installation.');
check(hasSize(512), 'No 512x512 icon — Chrome requires one to offer installation.');
check(
  icons.some((i) => (i.purpose ?? '').split(' ').includes('maskable')),
  'No maskable icon — Android will letterbox the icon inside a white circle instead of filling the shape.'
);

// Declared icons must actually exist, or the browser silently drops them and the
// size checks above become meaningless.
for (const icon of icons) {
  const file = join(dist, icon.src.replace(/^\//, ''));
  check(existsSync(file), `manifest lists ${icon.src} but the file is not in the build.`);
}

// Shortcuts are the installed icon's context menu. They are easy to get wrong in
// a way nobody notices from a browser tab: a shortcut pointing at a route that
// no longer exists drops the user on the 404 page from their own dock, and the
// only way to see it is to install the app and right-click it.
const shortcuts = manifest.shortcuts ?? [];
for (const shortcut of shortcuts) {
  check(!!shortcut.name, 'a manifest shortcut has no name.');
  check(
    typeof shortcut.url === 'string' && shortcut.url.startsWith('/'),
    `shortcut "${shortcut.name}" has a url that is not app-relative: ${shortcut.url}`,
  );
  for (const icon of shortcut.icons ?? []) {
    check(
      existsSync(join(dist, icon.src.replace(/^\//, ''))),
      `shortcut "${shortcut.name}" lists ${icon.src} but the file is not in the build.`,
    );
  }
}

if (failures.length) {
  console.error('The app would not be installable:\n');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `Installable: ${manifest.name} (${icons.length} icons, ${shortcuts.length} shortcuts, ` +
    `display: ${manifest.display}), service worker present.`,
);
