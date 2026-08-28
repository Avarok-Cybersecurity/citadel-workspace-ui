/**
 * axe against the screens a visitor meets before they have an account.
 *
 * There is already an accessibility spec — `integration-tests/src/tests-pw/
 * accessibility.spec.ts` — and it is better than this one: it signs in and
 * covers the workspace. It also needs a backend, an account and a completed
 * registration, so when registration breaks it stops running, and it stops
 * running silently.
 *
 * That is the shape round 188 recorded: `check-mobile-layout.mjs` spent weeks
 * timing out behind an earlier failure in the same job, and a dead check behind
 * a failing check is indistinguishable from a passing one. The pre-auth screens
 * need nothing but a served bundle, so their accessibility should not depend on
 * whether an account can be created.
 *
 * Includes `wcag22aa`, which the spec does not: WCAG 2.2 is where target size
 * lives, and three controls were found at 21px against its 24px floor.
 *
 * Gated on `serious` and `critical`, matching the spec — `minor` and `moderate`
 * are dominated by advice that would make this a running argument with the
 * designer rather than a defect gate.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.A11Y_PORT ?? 4186);
const ORIGIN = `http://localhost:${PORT}`;

/** WCAG 2.0, 2.1 and 2.2, A and AA. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });

async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`${ORIGIN}/`)).ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  if (!existsSync(join(APP_ROOT, 'dist', 'index.html'))) {
    console.error('\n  dist/ is missing — run `npm run build` first.\n');
    process.exit(1);
  }

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: APP_ROOT,
    stdio: 'ignore',
  });
  if (!(await waitForServer())) {
    preview.kill();
    console.error('\n  vite preview did not start.\n');
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // A phone viewport, because that is where a layout runs out of room and
    // starts producing the overlaps and clipped labels axe can see.
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();

    const screens = [
      ['landing', async () => { await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' }); }],
      ['sign-in', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('sign-in-button').click({ force: true });
      }],
      ['create-account', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('create-account-button').click({ force: true });
      }],
      ['manage-accounts', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('manage-accounts-button').click({ force: true });
      }],
      // Settings is reachable from the landing page with no account, and every
      // tab is its own surface. The Theme tab shipped a serious
      // `aria-input-field-name`: Radix puts `role="slider"` on the THUMB, so the
      // `<Label htmlFor>` beside it named nothing, and the Font Size control had
      // no accessible name at all. Four surfaces were being scanned while this
      // one sat one click away.
      ...['General', 'Connect', 'Theme', 'Privacy', 'Perms'].map((tab) => [
        `settings/${tab}`,
        async () => {
          if (!(await page.locator('[role="tab"]').filter({ hasText: tab }).count())) {
            await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
            await page.locator('button').filter({ hasText: /^Settings$/ }).first().click({ force: true });
            await page.waitForTimeout(800);
          }
          await page.locator('[role="tab"]').filter({ hasText: tab }).first().click({ force: true });
        },
      ]),
      // The wizard's later steps, which the four-surface list never reached.
      // Round 208's defect was on a surface exactly like these: reachable in
      // three clicks, scanned by nothing that runs without a backend, and
      // broken by a change made somewhere else entirely.
      ['join/security', async () => {
        await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('create-account-button').click({ force: true });
        await page.waitForTimeout(900);
        await page.locator('#serverAddress').fill('127.0.0.1:12349');
        await page.locator('#password').fill('password123');
        await page.locator('button[type="submit"]').first().click({ force: true });
      }],
      ['join/profile', async () => {
        await page.locator('button').filter({ hasText: /^Next$/ }).last().click({ force: true });
      }],
      // The ERROR state, not just the empty form. Field errors are where
      // `aria-invalid` and `aria-describedby` are either present or the user is
      // told nothing they can act on — and an empty form proves neither.
      ['join/profile with a validation error', async () => {
        await page.locator('#fullName').fill('Probe');
        await page.locator('#username').fill('probe1');
        await page.locator('#password').fill('password123');
        await page.locator('#confirmPassword').fill('different999');
        await page.locator('button').filter({ hasText: /^Join$/ }).last().click({ force: true });
        await page.waitForTimeout(1_200);
      }],
      // Any unrouted path. Cheap, and it is the one screen a user reaches by
      // accident rather than on purpose.
      ['not-found', async () => {
        await page.goto(`${ORIGIN}/no-such-page`, { waitUntil: 'domcontentloaded' });
      }],
    ];

    let scanned = 0;
    for (const [name, go] of screens) {
      await go();
      // Animations move elements while axe measures them, and a colour read
      // mid-transition is fiction. Settle before scanning.
      await page.waitForTimeout(1_200);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      scanned += 1;

      // axe does not check error ASSOCIATION.
      //
      // Dropping `aria-describedby` from an invalid field and orphaning its
      // message leaves the scan completely green -- measured, not assumed. A
      // screen-reader user then hears "invalid entry" with no idea what is
      // wrong. So the association is asserted directly, on the one surface that
      // has an error in it, rather than left to a scan that cannot see it.
      // Everything the user can act on must be reachable by Tab.
      //
      // axe does not traverse: it inspects a static tree, so a control that is
      // present, named and correctly roled but sits outside the tab order
      // passes every rule it has. That is the whole failure mode for a keyboard
      // user, and this repository has shipped it before -- the join form's
      // password toggle carried `tabIndex={-1}`, so nobody using a keyboard
      // could reveal what they had typed.
      //
      // Composite widgets are excluded deliberately, not overlooked. A Radix
      // TabsList uses roving tabindex: exactly one tab is tabbable and the
      // arrow keys move between them, which is the correct pattern and reads
      // as "unreachable" to a naive count. Expecting each tab to be a separate
      // Tab stop was this rule's first output, and it was wrong.
      const unreachable = await page.evaluate(async () => {
        const scope = document.querySelector('[role="dialog"]') ?? document.body;
        const COMPOSITE = new Set(['tab', 'radio', 'menuitem', 'option', 'treeitem']);
        const describe = (el) =>
          `${el.tagName}:${(el.getAttribute('aria-label') || el.id || (el.textContent || '').trim()).slice(0, 24)}`;
        const expected = [...scope.querySelectorAll('button, a[href], input, select, textarea')]
          .filter((el) => el.offsetParent !== null && !el.disabled)
          // NOT filtered on `tabindex="-1"`.
          //
          // That filter was here first, and it made the rule unable to fail:
          // marking a control `tabIndex={-1}` removed it from the expectations,
          // so the exact defect this exists for -- the join form's password
          // toggle, which shipped with `tabIndex={-1}` and could not be reached
          // by any keyboard user -- would have been excluded rather than
          // reported. Both negative controls passed, which is the only reason
          // it was noticed.
          //
          // `-1` is the defect, not an exemption. The legitimate uses of it are
          // composite-widget members, and those are excluded by role below.
          .filter((el) => !COMPOSITE.has(el.getAttribute('role') ?? ''))
          .filter((el) => !el.closest('[role="tablist"],[role="radiogroup"],[role="menu"],[role="listbox"]'));
        return { expected: expected.map(describe) };
      });

      const reached = new Set();
      for (let i = 0; i < unreachable.expected.length * 3 + 6; i += 1) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          return `${el.tagName}:${(el.getAttribute('aria-label') || el.id || (el.textContent || '').trim()).slice(0, 24)}`;
        });
        if (focused) reached.add(focused);
      }
      const missed = [...new Set(unreachable.expected.filter((e) => !reached.has(e)))];
      record(`${name}: every control is reachable by keyboard`, missed.length === 0, missed.join(' | '));

      // A combobox must be named by its LABEL, not by its value.
      //
      // Radix renders a select trigger as `<button role="combobox">`, and
      // `htmlFor` labels only labelable elements -- so the conventional
      // `<Label htmlFor="x">` beside `<SelectTrigger id="x">` names nothing and
      // the accessible name falls back to the trigger's contents, which is the
      // current value. Measured on Settings: "Connections" and "Default".
      //
      // axe passes that, because a name computed from contents is still a name.
      // What it cannot see is that the name is the wrong THING, and that it
      // changes when the value does, so there is nothing stable to refer to.
      const unnamedSelects = await page.evaluate(() => {
        const scope = document.querySelector('[role="dialog"]') ?? document.body;
        return [...scope.querySelectorAll('[role="combobox"]')]
          .filter((el) => el.offsetParent !== null)
          .filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
          .map((el) => `${el.id || '(no id)'}: "${(el.textContent || '').trim().slice(0, 24)}"`);
      });
      record(
        `${name}: every select is named by its label`,
        unnamedSelects.length === 0,
        unnamedSelects.join('; '),
      );

      // Two controls with the same accessible name, in the same view.
      //
      // axe does not report it: each button HAS a name, which is all
      // `button-name` asks. But the create-account form had two toggles both
      // called "Show password", one per password field, and a screen-reader
      // user tabbing through hears the same name twice with nothing to say
      // which field they are on. WCAG 4.1.2 wants the name to identify the
      // control, and an action alone does not when the action repeats.
      const duplicates = await page.evaluate(() => {
        const scope = document.querySelector('[role="dialog"]') ?? document.body;
        const names = [...scope.querySelectorAll('button')]
          .filter((b) => b.offsetParent !== null)
          // Buttons only, by ROLE. A `<button role="tab">` named "Connections"
          // beside a `<button role="combobox">` whose VALUE is "Connections"
          // is not a collision: a screen reader says "Connections, tab" and
          // "Connections, combobox", and the roles tell them apart. That pair
          // was the rule's first output and it was a false positive, which is
          // worth more than a green run -- a check that cries wolf gets muted.
          //
          // The combobox also shows why `textContent` is not a name in general:
          // on a Radix select trigger it is the current VALUE. Restricting to
          // plain buttons keeps the extraction honest.
          .filter((b) => !b.hasAttribute('role') || b.getAttribute('role') === 'button')
          .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim())
          .filter((n) => n.length > 0);
        return [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
      });
      record(
        `${name}: no two controls share a name`,
        duplicates.length === 0,
        duplicates.join('; '),
      );

      if (name.includes('validation error')) {
        const association = await page.evaluate(() => {
          const field = document.querySelector('[aria-invalid="true"]');
          if (!field) return { ok: false, why: 'nothing is marked invalid' };
          const id = field.getAttribute('aria-describedby');
          if (!id) return { ok: false, why: `${field.id} is invalid but describes nothing` };
          const message = document.getElementById(id);
          if (!message) return { ok: false, why: `${field.id} points at #${id}, which does not exist` };
          const text = (message.textContent ?? '').trim();
          return text.length > 0
            ? { ok: true, why: text.slice(0, 40) }
            : { ok: false, why: `#${id} is empty` };
        });
        record('the invalid field names its error', association.ok, association.why);
      }
      const blocking = violations.filter((v) => BLOCKING.has(v.impact));
      record(
        `${name}: no serious or critical violations`,
        blocking.length === 0,
        blocking.map((v) => `${v.id} x${v.nodes.length}`).join('; '),
      );
    }

    // A scan that reached no screen is a clean run over nothing.
    record('every screen was reached', scanned === screens.length, `${scanned}/${screens.length}`);

    await context.close();
  } finally {
    await browser.close();
    preview.kill();
  }

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n  Accessibility — ${ORIGIN} (production bundle, 375px)\n`);
  for (const { name, ok, detail } of results) {
    console.log(`  ${name.padEnd(width)}  ${ok ? 'ok  ' : 'FAIL'}${detail ? `  ${detail}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n  ${failed.length} accessibility check(s) failed.\n`);
    process.exit(1);
  }
  console.log('\n  All accessibility checks passed.\n');
}

await main();
