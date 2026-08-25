/**
 * Visual sweep — a TOOL, not a test.
 *
 * Captures every surface across both colour schemes and both widths into
 * /tmp/uishots for a human (or a model) to look at. It asserts almost nothing
 * on purpose, which is exactly why it lives OUTSIDE `src/tests-pw`: a spec that
 * always passes and only writes files would sit in CI looking like coverage
 * while proving nothing.
 *
 * Run it deliberately:
 *   npx playwright test src/tools/visual-sweep.spec.ts --config=playwright.config.ts \
 *     --grep "authenticated"
 *
 * It earns its keep: the defects it found in one night were dialogs rendering
 * edge-to-edge on a phone, Messages laying out two desktop columns in 375px,
 * role badges washed out in light, and — the largest — every heading, every
 * bold run and the entire navigation tree invisible in light mode. Not one of
 * those was reported by axe, the contrast suite, the overflow check or the
 * tap-target check. They had to be looked at.
 *
 * Two traps it taught, both fixed here:
 *   - Set the theme then RELOAD. next-themes reads its key while booting, so a
 *     pushState navigation leaves the old scheme and the "light" captures come
 *     out byte-identical to the dark ones.
 *   - Settle animations before every shot, skipping indefinite ones. A dialog
 *     caught mid `zoom-in-95` measures 22.8px where it renders 24.
 */
import { test, type BrowserContext, type Page } from '@playwright/test';
import {
  clearBrowserStorage, closeAnyModals, createAccount,
  waitForAppReady, waitForWorkspaceLoaded, config,
} from '../lib/index.js';

const OUT = '/tmp/uishots';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 375, height: 667 };

async function settle(page: Page): Promise<void> {
  await page
    .evaluate(() =>
      Promise.all(
        document.getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    )
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string): Promise<void> {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

test.describe.serial('visual sweep', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    context = await browser.newContext({ viewport: DESKTOP });
    page = await context.newPage();
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: 'commit', timeout: 60_000 });
    await waitForAppReady(page, 60_000);
  });

  test.afterAll(async () => { await context.close(); });

  test('pre-auth surfaces, both schemes and both widths', async () => {
    test.setTimeout(300_000);
    for (const scheme of ['dark', 'light'] as const) {
      await page.evaluate((s) => localStorage.setItem('citadel:theme', s), scheme);
      for (const [label, vp] of [['desktop', DESKTOP], ['phone', PHONE]] as const) {
        await page.setViewportSize(vp);
        await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
        await waitForAppReady(page, 60_000);
        await shot(page, `landing-${scheme}-${label}`);

        await page.getByRole('button', { name: /Login Workspace/i }).click({ force: true });
        await page.waitForTimeout(800);
        await shot(page, `login-${scheme}-${label}`);

        await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
        await waitForAppReady(page, 60_000);
        await page.getByRole('button', { name: /Join Workspace/i }).click({ force: true });
        await page.waitForTimeout(800);
        await shot(page, `join-${scheme}-${label}`);

        await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
        await waitForAppReady(page, 60_000);
        await page.getByRole('button', { name: /Manage Accounts/i }).click({ force: true });
        await page.waitForTimeout(800);
        await shot(page, `accounts-${scheme}-${label}`);
      }
    }
    await page.setViewportSize(DESKTOP);
  });

  test('authenticated surfaces', async () => {
    // Split per scheme, and 600s: the previous single test did 2 schemes x 2
    // widths x 3 surfaces with a reload and a workspace wait each, and ran out
    // of budget mid-capture.
    test.setTimeout(600_000);
    await page.evaluate(() => localStorage.setItem('citadel:theme', 'dark'));
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await waitForAppReady(page, 60_000);

    const user = `vis_${Date.now()}`;
    await createAccount(page, user, { isFirstUser: true, password: config.DEFAULT_PASSWORD });
    await waitForWorkspaceLoaded(page, 90_000);
    await closeAnyModals(page);

    // Navigate by ROUTE, not back to '/'. The earlier version pushed '/' between
    // surfaces, which is the Landing route — so every "workspace" capture was
    // actually the landing page wearing an active-session bar.
    const go = async (route: string) => {
      await page.evaluate((r) => {
        window.history.pushState({}, '', r);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await page.waitForTimeout(1500);
    };

    for (const scheme of ['dark', 'light'] as const) {
      await page.evaluate((sc) => localStorage.setItem('citadel:theme', sc), scheme);
      // RELOAD, not pushState. next-themes reads the key while booting, and a
      // history navigation does not remount its provider — so the earlier
      // version of this loop wrote 'light' and captured dark, producing four
      // "light" screenshots that were byte-identical to the dark ones.
      await page.reload({ waitUntil: 'commit', timeout: 60_000 });
      await waitForAppReady(page, 60_000);
      await waitForWorkspaceLoaded(page, 90_000).catch(() => {});
      await closeAnyModals(page);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      if (isDark !== (scheme === 'dark')) {
        throw new Error(`theme did not apply: wanted ${scheme}, document dark=${isDark}`);
      }

      for (const [label, vp] of [['desktop', DESKTOP], ['phone', PHONE]] as const) {
        await page.setViewportSize(vp);
        await go('/workspace');
        await shot(page, `workspace-${scheme}-${label}`);

        await go('/messages');
        await shot(page, `messages-${scheme}-${label}`);

        await go('/directory');
        await shot(page, `directory-${scheme}-${label}`);

        await go('/workspace');
        await page.getByTestId('user-avatar-button').click({ force: true }).catch(() => {});
        await page.waitForTimeout(600);
        await page.getByRole('menuitem', { name: 'Settings' }).click({ force: true }).catch(() => {});
        await page.waitForTimeout(1500);
        await shot(page, `settings-${scheme}-${label}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
      await page.setViewportSize(DESKTOP);
    }
  });

  test('nothing overlaps at phone width', async () => {
    test.setTimeout(300_000);
    // Diagnostics OFF, so this measures what a real user sees: the Leader
    // indicator is dev-only (isDiagnosticsUiEnabled) and would otherwise crowd
    // the top bar in a way production never shows.
    await page.evaluate(() => {
      localStorage.setItem('citadel:diagnostics', 'false');
      localStorage.setItem('citadel:theme', 'dark');
    });
    // Its own account, so this can run standalone rather than only after the
    // capture test above has happened to leave a session behind.
    await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
    await waitForAppReady(page, 60_000);
    const already = await page.getByTestId('user-avatar-button').count().catch(() => 0);
    if (already === 0) {
      const user = `ovl_${Date.now()}`;
      await createAccount(page, user, { isFirstUser: true, password: config.DEFAULT_PASSWORD });
      await waitForWorkspaceLoaded(page, 90_000);
      await closeAnyModals(page);
    }
    await page.setViewportSize(PHONE);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/workspace');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(2000);
    await closeAnyModals(page);
    await settle(page);

    const overlaps = await page.evaluate(() => {
      // LEAF elements carrying text or acting as controls. Ancestors legitimately
      // contain their descendants, so only leaves can meaningfully "overlap".
      const leaves = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter((el) => {
        if (el.children.length > 0) return false;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) return false;
        // Only things a user perceives: text, or an interactive control.
        const hasText = (el.textContent || '').trim().length > 0;
        const isControl = ['BUTTON', 'A', 'INPUT', 'SVG'].includes(el.tagName);
        return hasText || isControl;
      });

      const hits: string[] = [];
      for (let i = 0; i < leaves.length; i += 1) {
        for (let j = i + 1; j < leaves.length; j += 1) {
          const a = leaves[i], b = leaves[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          // 2px of tolerance: sub-pixel layout and borders touch constantly.
          if (w > 2 && h > 2) {
            const label = (el: HTMLElement) =>
              `<${el.tagName.toLowerCase()}>"${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18)}"`;
            hits.push(`${label(a)} x ${label(b)} overlap ${Math.round(w)}x${Math.round(h)}`);
          }
        }
      }
      return hits.slice(0, 15);
    });

    console.log(`OVERLAPS(${overlaps.length}):\n  ` + (overlaps.join('\n  ') || '(none)'));
  });

  test('measure the user-search popover row', async () => {
    test.setTimeout(300_000);
    await page.setViewportSize(PHONE);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/directory');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(2000);
    // NOT clicking the input: the popover is already open in the captured state,
    // and clicking it repositions/resizes, which is why the first measurement
    // disagreed with the screenshot.
    await page.waitForTimeout(1500);
    await settle(page);

    const m = await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]');
      if (!list) return { error: 'no listbox' };
      const opt = list.querySelector('[role="option"]') as HTMLElement | null;
      const badgeEl = opt?.querySelector('[class*="rounded-full"],[class*="border"]');
      if (!opt) return { error: 'no option row' };
      const name = opt.querySelector('p');
      const badge = badgeEl ?? opt.querySelector('span:last-of-type');
      const box = (el: Element | null) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
      };
      // Walk up recording each ancestor's width, to find where the constraint is lost.
      const chain: string[] = [];
      let cur: HTMLElement | null = opt;
      for (let i = 0; i < 8 && cur; i += 1) {
        const r = cur.getBoundingClientRect();
        const cs = getComputedStyle(cur);
        chain.push(`${cur.tagName.toLowerCase()} w=${Math.round(r.width)} right=${Math.round(r.right)} display=${cs.display} overflow=${cs.overflow}`);
        cur = cur.parentElement;
      }
      const card = opt.closest('[class*="absolute"]') as HTMLElement | null;
      return {
        viewport: window.innerWidth,
        popover: card ? { left: Math.round(card.getBoundingClientRect().left), right: Math.round(card.getBoundingClientRect().right), overflow: getComputedStyle(card).overflow } : null,
        option: box(opt), name: box(name), badge: box(badge),
        nameText: (name?.textContent || '').slice(0, 30),
        nameOverflow: name ? getComputedStyle(name).textOverflow : null,
        chain,
      };
    });
    console.log('MEASURE ' + JSON.stringify(m, null, 1));
  });

  test('measure sidebar tree label contrast in light', async () => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => localStorage.setItem('citadel:theme', 'light'));
    await page.reload({ waitUntil: 'commit', timeout: 60_000 });
    await waitForAppReady(page, 60_000);
    await waitForWorkspaceLoaded(page, 90_000).catch(() => {});
    await closeAnyModals(page);
    await settle(page);

    const r = await page.evaluate(() => {
      const lum = (c: string) => {
        const m = c.match(/\d+(\.\d+)?/g);
        if (!m) return null;
        const [r, g, b] = m.slice(0, 3).map(Number).map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      // Walk up for the first non-transparent background.
      const bgOf = (el: HTMLElement): string => {
        let cur: HTMLElement | null = el;
        while (cur) {
          const bg = getComputedStyle(cur).backgroundColor;
          if (bg && !bg.includes('rgba(0, 0, 0, 0)')) return bg;
          cur = cur.parentElement;
        }
        return 'rgb(255,255,255)';
      };
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar] span, aside span, nav span'))) {
        const text = (el.textContent || '').trim();
        if (!text || text.length > 24 || el.children.length) continue;
        const cs = getComputedStyle(el);
        const fg = lum(cs.color), bg = lum(bgOf(el));
        if (fg === null || bg === null) continue;
        const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        if (ratio < 4.5) out.push(`"${text}" ${cs.color} on ${bgOf(el)} = ${ratio.toFixed(2)} opacity=${cs.opacity}`);
      }
      return out.slice(0, 12);
    });
    console.log('LOWCONTRAST(' + r.length + '):\n  ' + (r.join('\n  ') || '(none)'));
  });

  test('find unnamed controls', async () => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => localStorage.setItem('citadel:theme', 'light'));
    await page.reload({ waitUntil: 'commit', timeout: 60_000 });
    await waitForAppReady(page, 60_000);
    await waitForWorkspaceLoaded(page, 90_000).catch(() => {});
    await closeAnyModals(page);
    await settle(page);

    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const name =
          (el.getAttribute('aria-label') || '').trim() ||
          (el.textContent || '').trim() ||
          (el.getAttribute('title') || '').trim();
        if (name) continue;
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy && document.getElementById(labelledBy)) continue;
        out.push(`${el.className.toString().slice(0, 70)} | popup=${el.getAttribute('aria-haspopup')} | testid=${el.getAttribute('data-testid')} | html=${el.outerHTML.slice(0, 120)}`);
      }
      return out.slice(0, 6);
    });
    console.log('UNNAMED(' + bad.length + '):\n  ' + (bad.join('\n  ') || '(none)'));
  });
});
