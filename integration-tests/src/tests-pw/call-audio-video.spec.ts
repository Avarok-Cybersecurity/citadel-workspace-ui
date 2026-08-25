/**
 * Proof that audio and video actually work.
 *
 * The load-bearing assertion is the LAST one in each direction: that a remote
 * participant's <video> element reports a non-zero videoWidth. Nothing else in
 * this file would fail if media never left the machine — a call surface can
 * render, a timer can tick and both sides can agree they are "in a call" while
 * not one frame has crossed the network.
 *
 * A non-zero videoWidth means a frame was captured, encoded by WebCodecs,
 * fragmented, carried over the peer's UDP channel through the internal service,
 * reassembled, decoded and painted. That is the whole path.
 *
 * Chromium's fake capture device supplies a moving pattern, so no camera is
 * needed and no permission prompt appears — without both, this test would
 * require hardware CI does not have and would block on a dialog before
 * asserting anything.
 */

import { test, expect } from '@playwright/test';
import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import {
  clearBrowserStorage,
  waitForAppReady,
  createAccount,
  waitForWorkspaceLoaded,
  closeAnyModals,
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  waitForP2PChannelReady,
} from '../lib/index.js';
import { config, isCI } from '../lib/config.js';

interface UserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  username: string;
}

const stamp = Date.now();
const USERS = {
  a: { username: `pw_call_a_${stamp}`, password: 'test12345' },
  b: { username: `pw_call_b_${stamp}`, password: 'test12345' },
};

const LAUNCH_ARGS = [
  // Synthetic camera and microphone: a moving pattern and a tone, with the
  // permission prompt auto-accepted.
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-ipc-flooding-protection',
  ...(isCI
    ? ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-extensions']
    : []),
];

let sessionA: UserSession;
let sessionB: UserSession;

async function createSession(label: 'a' | 'b', isFirst: boolean): Promise<UserSession> {
  const browser = await chromium.launch({ headless: isCI, slowMo: isCI ? 0 : 50, args: LAUNCH_ARGS });
  const context = await browser.newContext({
    storageState: undefined,
    permissions: ['camera', 'microphone'],
  });
  await context.clearCookies();
  const page = await context.newPage();

  await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
  await clearBrowserStorage(page);
  await waitForAppReady(page, 60_000);

  const user = USERS[label];
  const registered = await createAccount(page, user.username, {
    isFirstUser: isFirst,
    password: user.password,
    uxTracker: null,
  });
  if (!registered) {
    await browser.close();
    throw new Error(`Failed to register ${label}: ${user.username}`);
  }

  expect(await waitForWorkspaceLoaded(page, 30_000), 'the workspace should finish loading').toBe(true);
  await closeAnyModals(page);

  return { browser, context, page, username: user.username };
}

/**
 * Wait until a remote tile is painting real pixels.
 *
 * videoWidth stays 0 until the first frame has actually decoded, which is
 * precisely the difference between "the element exists" and "media is flowing".
 */
async function waitForRemoteVideo(page: Page, timeoutMs = 60_000): Promise<number> {
  const handle = await page.waitForFunction(
    () => {
      // The self tile is rendered with cid -1 and carries the LOCAL camera, so
      // it always has a non-zero videoWidth. Matching every participant tile
      // made this assertion pass without a single frame crossing the network —
      // a proof of nothing. Only a remote tile can demonstrate transport.
      const tiles = Array.from(
        document.querySelectorAll('[data-testid^="participant-tile-"]'),
      ).filter((t) => t.getAttribute('data-testid') !== 'participant-tile--1');
      for (const tile of tiles) {
        const video = tile.querySelector('video') as HTMLVideoElement | null;
        if (video && video.videoWidth > 0) return video.videoWidth;
      }
      return null;
    },
    undefined,
    { timeout: timeoutMs },
  );
  return (await handle.jsonValue()) as number;
}

test.describe.serial('Audio and video calling', () => {
  test.beforeAll(async () => {
    test.setTimeout(300_000);
    sessionA = await createSession('a', true);
    sessionB = await createSession('b', false);
  });

  test.afterAll(async () => {
    await sessionA?.browser.close();
    await sessionB?.browser.close();
  });

  test('the two peers connect', async () => {
    test.setTimeout(300_000);
    await p2pRegister(sessionA.page, sessionA.username, sessionB.username);
    await acceptP2PRequest(sessionB.page, sessionB.username);
    await waitForP2PChannelReady(sessionA.page, sessionA.username, sessionB.username);
    await waitForP2PChannelReady(sessionB.page, sessionB.username, sessionA.username);

    await openConversation(sessionA.page, sessionA.username, sessionB.username);
    await openConversation(sessionB.page, sessionB.username, sessionA.username);
  });

  test('the call buttons are offered once a peer is connected', async () => {
    test.setTimeout(180_000);

    // Wait for the ENABLED state specifically, retrying, rather than for
    // "either state". The header legitimately flips between the two while the
    // peer connection settles, so a single sample of "either" can catch the
    // disabled render and then find neither by the time the next assertion
    // runs — which is a race in the test, not a fact about the product.
    const available = sessionA.page.getByTestId('call-start-audio');
    const unavailable = sessionA.page.getByTestId('call-unavailable');

    await expect(async () => {
      await expect(available).toBeVisible({ timeout: 5_000 });
    })
      .toPass({ timeout: 120_000 })
      .catch(async () => {
        // Never became available: report WHY, from the disabled control's own
        // tooltip, instead of a bare timeout.
        //
        // The tooltip is a Radix one, mounted only while hovered — it is NOT a
        // native `title`. Reading the attribute returned null every time, which
        // turned each of these failures into an unfalsifiable "something went
        // wrong" and is why they went undiagnosed for so long. Hover, then read
        // what the user would actually be shown.
        let reason = 'neither the enabled nor the disabled call buttons ever rendered';
        if (await unavailable.count()) {
          await unavailable.getByRole('button').first().hover().catch(() => {});
          const tip = sessionA.page.getByRole('tooltip').first();
          reason =
            (await tip.textContent({ timeout: 5_000 }).catch(() => null)) ??
            'the disabled call buttons rendered, but their tooltip never opened';
        }
        await sessionA.page.screenshot({ path: 'test-results/call-unavailable-A.png' });
        throw new Error(`calling never became available to A: ${reason.trim()}`);
      });

    await expect(sessionA.page.getByTestId('call-start-video')).toBeVisible();
  });

  test('calling rings the other side', async () => {
    test.setTimeout(180_000);
    await sessionA.page.getByTestId('call-start-video').click();

    // The caller sees a ringing state rather than an empty call surface.
    await expect(sessionA.page.getByTestId('call-stage')).toBeVisible({ timeout: 30_000 });

    // And the callee is rung wherever they are in the app.
    await expect(sessionB.page.getByTestId('incoming-call-card')).toBeVisible({ timeout: 60_000 });
    await expect(sessionB.page.getByText(/incoming video call/i)).toBeVisible();
  });

  test('accepting puts both sides in the call', async () => {
    test.setTimeout(180_000);
    await sessionB.page.getByTestId('incoming-call-accept').click();

    await expect(sessionB.page.getByTestId('call-stage')).toBeVisible({ timeout: 60_000 });
    await expect(sessionB.page.getByTestId('incoming-call-card')).toHaveCount(0);
    await expect(sessionA.page.getByTestId('call-controls')).toBeVisible({ timeout: 60_000 });
  });

  test('video actually flows from A to B', async () => {
    // The assertion this whole file exists for. See the header: a non-zero
    // videoWidth is the only thing here that could not pass if media never
    // left the machine.
    test.setTimeout(180_000);
    const width = await waitForRemoteVideo(sessionB.page);

    expect(width, 'B should be decoding real frames from A').toBeGreaterThan(0);
  });

  test('video actually flows from B to A', async () => {
    test.setTimeout(180_000);
    const width = await waitForRemoteVideo(sessionA.page);

    expect(width, 'A should be decoding real frames from B').toBeGreaterThan(0);
  });

  test('muting is announced to the other side, not merely local', async () => {
    // A mute that only stops the local track leaves the far side unable to tell
    // a muted peer from a crashed one.
    test.setTimeout(120_000);
    await sessionA.page.getByTestId('call-toggle-mic').click();

    await expect(sessionA.page.getByRole('button', { name: /unmute microphone/i })).toBeVisible();
    await expect(sessionB.page.getByText('muted')).toBeVisible({ timeout: 30_000 });
  });

  test('leaving ends the call on both sides', async () => {
    test.setTimeout(120_000);
    await sessionA.page.getByTestId('call-leave').click();

    await expect(sessionA.page.getByTestId('call-stage')).toHaveCount(0, { timeout: 30_000 });
    // The far side must not be left sitting in a call that is over.
    await expect(sessionB.page.getByTestId('call-stage')).toHaveCount(0, { timeout: 60_000 });
  });
});
