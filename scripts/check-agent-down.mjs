/**
 * What a first-run user sees before they have started the agent.
 *
 * The most common state a new user is in — the app installed, the agent not
 * running yet — and nothing tested it. `vite preview` proxies `/ws` to
 * `AGENT_PORT`, so pointing that at a dead port reproduces it exactly, with no
 * stack and no account.
 *
 * The first attempt at this investigation measured a machine that HAD an agent
 * running and concluded the banner could never fire (see round 202). So this
 * script proves its own premise first: if anything answers on the port it is
 * pointed at, it fails rather than reporting on a state it is not in.
 *
 * What is asserted is the recovery path, not the failure:
 *   - the user is told, in the banner, in words about the agent;
 *   - the dialog offers the thing they need, which is how to start it;
 *   - the dialog can be put away and STAYS away, because the client retries
 *     while the agent is down and every dismissal used to be undone within a
 *     second or two, indefinitely;
 *   - the rest of the app still works, so they can read Settings or the
 *     download hint rather than staring at a modal.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createConnection } from 'node:net';
import { chromium } from 'playwright';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AGENT_DOWN_PORT ?? 4203);
const DEAD_AGENT_PORT = Number(process.env.AGENT_DOWN_AGENT_PORT ?? 12399);
const ORIGIN = `http://localhost:${PORT}`;

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

/** Whether anything is listening. The premise this whole check rests on. */
function portIsDead(port) {
  return new Promise((resolveDead) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = (dead) => { socket.destroy(); resolveDead(dead); };
    socket.setTimeout(1500);
    socket.on('connect', () => done(false));
    socket.on('error', () => done(true));
    socket.on('timeout', () => done(true));
  });
}

async function main() {
  if (!existsSync(join(APP_ROOT, 'dist', 'index.html'))) {
    console.error('\n  dist/ is missing — run `npm run build` first.\n');
    process.exit(1);
  }

  if (!(await portIsDead(DEAD_AGENT_PORT))) {
    console.error(
      `\n  Something is listening on ${DEAD_AGENT_PORT}, so this check would measure a\n` +
        '  CONNECTED app and report that the agent-down state works. Set\n' +
        '  AGENT_DOWN_AGENT_PORT to a port nothing uses.\n',
    );
    process.exit(1);
  }

  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: APP_ROOT,
    stdio: 'ignore',
    env: { ...process.env, AGENT_PORT: String(DEAD_AGENT_PORT) },
  });
  if (!(await waitForServer())) {
    preview.kill();
    console.error('\n  vite preview did not start.\n');
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });

    const banner = await page
      .waitForSelector('[data-testid="agent-down-banner"]', { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    record('the user is told the agent is unreachable', banner);

    if (banner) {
      const text = await page.textContent('[data-testid="agent-down-banner"]');
      // "Agent", not "connection lost": naming the local process the user can
      // restart is the difference between an actionable message and one that
      // sends them to check their wifi.
      record('the banner names the agent, not the network', /agent/i.test(text ?? ''), (text ?? '').trim().slice(0, 60));
    }

    const dialog = await page.waitForSelector('[role="dialog"]', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    record('a dialog offers a way forward', dialog);

    if (dialog) {
      const body = (await page.textContent('[role="dialog"]')) ?? '';
      record('it says how to start the agent', /run|command|download|install/i.test(body));

      await page.locator('[role="dialog"] button').first().focus();
      await page.keyboard.press('Escape');
      // Long enough to outlast several retry cycles: the defect this covers
      // reopened the dialog within a second or two, for ever.
      await page.waitForTimeout(8_000);
      const reopened = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length);
      record('dismissing it makes it stay dismissed', reopened === 0, `${reopened} dialog(s) after 8s`);

      const stillExplained = await page.evaluate(
        () => Boolean(document.querySelector('[data-testid="agent-down-banner"]')),
      );
      record('the banner still explains the state afterwards', stillExplained);

      await page.getByTestId('sign-in-button').click({ force: true }).catch(() => {});
      await page.waitForTimeout(1_500);
      const form = await page.locator('#username').count();
      record('the app is still usable — sign-in is reachable', form > 0);
    }

    await context.close();
  } finally {
    await browser.close();
    preview.kill();
  }

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\n  Agent down — ${ORIGIN} (production bundle, /ws → dead port ${DEAD_AGENT_PORT})\n`);
  for (const { name, ok, detail } of results) {
    console.log(`  ${name.padEnd(width)}  ${ok ? 'ok  ' : 'FAIL'}${detail ? `  ${detail}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n  ${failed.length} agent-down check(s) failed.\n`);
    process.exit(1);
  }
  console.log('\n  All agent-down checks passed.\n');
}

await main();
