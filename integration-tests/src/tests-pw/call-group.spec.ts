/**
 * Proof that GROUP calling carries real media between THREE participants.
 *
 * The engine fans one encoded stream out to every participant (encode once,
 * send to many), so the thing worth proving is that a third participant
 * genuinely decodes frames — and, harder, that two INVITEES decode each
 * other, since neither of them dialled and the caller relays nothing.
 *
 * The load-bearing assertions are therefore: on an invitee's page, TWO
 * distinct REMOTE participant tiles each reporting a non-zero videoWidth.
 * The self tile is rendered with cid -1 and carries the local camera, so it
 * always has video and is excluded — matching every tile once made this
 * exact assertion pass while no frame crossed the network.
 *
 * The call happens in an ad-hoc peer group, not an office room. A room's
 * callable roster is its MEMBERS, membership is admin-granted (verified in
 * async_domain_server_ops.rs: only UpdateWorkspace with the master password
 * pushes onto workspace.members, and rooms gain members only via AddMember),
 * so a room of freshly registered accounts correctly refuses to call — the
 * state this spec used to stop at. A peer group's members are explicit: the
 * creator picks them in CreateGroupDialog, every invitee auto-joins, and
 * GroupChatPage hands exactly that roster to the call controls.
 *
 * Three separate browsers, one per participant, as in the 1:1 proof: each
 * gets its own WASM client, its own fake camera, and no tab throttling of
 * another participant's encoder.
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
  waitForP2PChannelReady,
  openConversation,
  sendAndVerifyMessage,
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
  a: { username: `pw_gcall_a_${stamp}`, password: 'test12345' },
  b: { username: `pw_gcall_b_${stamp}`, password: 'test12345' },
  c: { username: `pw_gcall_c_${stamp}`, password: 'test12345' },
};

const GROUP_NAME = `Call Group ${stamp}`;

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
let sessionC: UserSession;
/** The backend-derived group id, read from A's sidebar row and then required
 *  verbatim on B's and C's — same id on three browsers IS the shared group. */
let groupId: string;

async function createSession(label: 'a' | 'b' | 'c', isFirst: boolean): Promise<UserSession> {
  const browser = await chromium.launch({ headless: isCI, slowMo: isCI ? 0 : 50, args: LAUNCH_ARGS });
  const context = await browser.newContext({
    storageState: undefined,
    permissions: ['camera', 'microphone'],
  });
  await context.clearCookies();
  const page = await context.newPage();

  // Call-path console lines surfaced into the test log, because a call that
  // never rings leaves no trace in the DOM: the evidence of where the signal
  // died lives only in the browser console.
  page.on('console', (msg) => {
    const text = msg.text();
    if (/\[Call\]|CallSignal|call:signal|CallInvite|sendP2PCommand|Failed to send|MediaSession/i.test(text)) {
      console.log(`  [${label}:console] ${text.slice(0, 300)}`);
    }
  });

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

async function connectPair(initiator: UserSession, acceptor: UserSession): Promise<void> {
  await p2pRegister(initiator.page, initiator.username, acceptor.username);
  await acceptP2PRequest(acceptor.page, acceptor.username);

  // Both sides into the conversation, so warmup messages can be typed and seen.
  expect(await openConversation(initiator.page, initiator.username, acceptor.username)).toBe(true);
  expect(await openConversation(acceptor.page, acceptor.username, initiator.username)).toBe(true);

  // Channel readiness is proven by message RECEIPT, and a freshly connected
  // ILM channel is one-way-warm at best — polling for ready without traffic
  // times out reporting 'connected but not yet ready'. A verified message in
  // each direction warms the channel AND is the readiness proof, so the
  // explicit checks afterwards are immediate.
  const nonce = Date.now();
  expect(
    await sendAndVerifyMessage(
      initiator.page, initiator.username, acceptor.page, acceptor.username,
      `warmup ${initiator.username} to ${acceptor.username} @ ${nonce}`,
    ),
    `warmup ${initiator.username} -> ${acceptor.username} should be delivered`,
  ).toBe(true);
  expect(
    await sendAndVerifyMessage(
      acceptor.page, acceptor.username, initiator.page, initiator.username,
      `warmup ${acceptor.username} to ${initiator.username} @ ${nonce}`,
    ),
    `warmup ${acceptor.username} -> ${initiator.username} should be delivered`,
  ).toBe(true);

  expect(
    await waitForP2PChannelReady(initiator.page, initiator.username, acceptor.username, 30_000),
    `${initiator.username} -> ${acceptor.username} channel should be ready`,
  ).toBe(true);
  expect(
    await waitForP2PChannelReady(acceptor.page, acceptor.username, initiator.username, 30_000),
    `${acceptor.username} -> ${initiator.username} channel should be ready`,
  ).toBe(true);
}

/**
 * Wait until at least `want` DISTINCT remote tiles are painting real pixels.
 *
 * videoWidth stays 0 until a first frame has actually decoded — the difference
 * between "a tile rendered" and "media arrived". Requiring two proves the
 * mesh: on an invitee's page one of those senders is the OTHER invitee.
 */
async function waitForRemoteVideos(page: Page, want: number, timeoutMs = 90_000): Promise<number> {
  const handle = await page.waitForFunction(
    (needed) => {
      const tiles = Array.from(
        document.querySelectorAll('[data-testid^="participant-tile-"]'),
      ).filter((t) => t.getAttribute('data-testid') !== 'participant-tile--1');
      let decoding = 0;
      for (const tile of tiles) {
        const video = tile.querySelector('video') as HTMLVideoElement | null;
        if (video && video.videoWidth > 0) decoding += 1;
      }
      return decoding >= needed ? decoding : null;
    },
    want,
    { timeout: timeoutMs },
  );
  return (await handle.jsonValue()) as number;
}

test.describe.serial('Group calling with three participants', () => {
  test.beforeAll(async () => {
    test.setTimeout(420_000);
    sessionA = await createSession('a', true);
    sessionB = await createSession('b', false);
    sessionC = await createSession('c', false);
  });

  test.afterAll(async () => {
    await sessionA?.browser.close();
    await sessionB?.browser.close();
    await sessionC?.browser.close();
  });

  test('all three peers connect pairwise', async () => {
    // Every pair, because a group call is a mesh: B and C exchange signals,
    // sessions and frames directly, without A in the middle.
    test.setTimeout(420_000);
    await connectPair(sessionA, sessionB);
    await connectPair(sessionA, sessionC);
    await connectPair(sessionB, sessionC);
  });

  test('A creates the group with B and C as members', async () => {
    test.setTimeout(300_000);
    const page = sessionA.page;

    // The CONVERSATIONS sidebar section — which carries the New Group button —
    // renders only once a conversation with messages exists; the pairwise
    // warmup traffic already created one on A's page.

    // The dialog's peer list comes from the registration roster, which can lag
    // the accepted registration by several seconds — so retry the whole
    // open-and-pick sequence rather than sampling it once.
    await expect(async () => {
      await closeAnyModals(page);
      await page.getByTestId('new-group-chat-button').click();
      await page.getByTestId('create-group-name').fill(GROUP_NAME);
      for (const peer of [sessionB.username, sessionC.username]) {
        await page.getByTestId('create-group-add-member').click();
        await page.getByTestId(`create-group-peer-${peer}`).click({ timeout: 5_000 });
      }
    }).toPass({ timeout: 90_000 });

    await page.getByTestId('create-group-submit').click();

    // The row appears only when GroupCreateSuccess came back and was applied —
    // creation is proven by the response, not by the dialog closing.
    const row = page.locator('[data-testid^="group-row-"]');
    await expect(row).toBeVisible({ timeout: 30_000 });
    const testId = await row.getAttribute('data-testid');
    groupId = testId!.replace('group-row-', '');
    expect(groupId.length, 'the group id should be backend-derived, not empty').toBeGreaterThan(0);

    // Fully closed, not merely closing: the dialog's exit animation outlives
    // this test, and a Cancel button that is mid-animation is exactly the kind
    // of half-present element a later cleanup helper wedges on.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15_000 });
  });

  test('the group reaches B and C without any action on their part', async () => {
    // The invite path: server-relayed GroupInviteNotification, auto-accepted
    // locally AND at the backend. The row must carry the SAME id as A's —
    // three browsers converging on one id is what makes it one group.
    test.setTimeout(180_000);
    for (const member of [sessionB, sessionC]) {
      await expect(
        member.page.getByTestId(`group-row-${groupId}`),
        `${member.username} should see the group in the sidebar`,
      ).toBeVisible({ timeout: 60_000 });
    }
  });

  test('every member reaches the group page and its call controls', async () => {
    test.setTimeout(180_000);
    for (const member of [sessionA, sessionB, sessionC]) {
      await member.page.bringToFront();
      await member.page.getByTestId(`group-row-${groupId}`).click();
      await expect(
        member.page.getByTestId('group-call-start-video'),
        `${member.username} should see group call controls`,
      ).toBeVisible({ timeout: 30_000 });
    }
  });

  test('calling becomes available to A once the members joined', async () => {
    // Disabled-with-reason is the product's honest state while the roster is
    // empty; it becomes enabled when the backend membership broadcasts land.
    // If this never enables, the invitees' backend acceptance never reached A.
    test.setTimeout(180_000);
    await expect(sessionA.page.getByTestId('group-call-start-video')).toBeEnabled({
      timeout: 120_000,
    });
  });

  test('starting the call rings both members', async () => {
    test.setTimeout(180_000);
    await sessionA.page.getByTestId('group-call-start-video').click();

    await expect(sessionA.page.getByTestId('call-stage')).toBeVisible({ timeout: 30_000 });
    await expect(sessionB.page.getByTestId('incoming-call-card')).toBeVisible({ timeout: 60_000 });
    await expect(sessionC.page.getByTestId('incoming-call-card')).toBeVisible({ timeout: 60_000 });
  });

  test('both members join the call', async () => {
    test.setTimeout(180_000);
    await sessionB.page.getByTestId('incoming-call-accept').click();
    await expect(sessionB.page.getByTestId('call-stage')).toBeVisible({ timeout: 60_000 });

    await sessionC.page.getByTestId('incoming-call-accept').click();
    await expect(sessionC.page.getByTestId('call-stage')).toBeVisible({ timeout: 60_000 });
  });

  test('B decodes frames from TWO distinct peers — the caller and the other invitee', async () => {
    // The assertion this spec exists for. B dialled nobody; one of these two
    // streams comes from C, who B only knows about because the invite carried
    // the roster and their accepts crossed directly. Fewer than two here means
    // hub-and-spoke, not a mesh.
    test.setTimeout(180_000);
    const decoding = await waitForRemoteVideos(sessionB.page, 2, 120_000);
    expect(decoding, 'B should decode video from A and from C').toBeGreaterThanOrEqual(2);
  });

  test('C decodes frames from TWO distinct peers as well', async () => {
    test.setTimeout(180_000);
    const decoding = await waitForRemoteVideos(sessionC.page, 2, 120_000);
    expect(decoding, 'C should decode video from A and from B').toBeGreaterThanOrEqual(2);
  });

  test('A decodes frames from both invitees — the fan-in side of the mesh', async () => {
    test.setTimeout(180_000);
    const decoding = await waitForRemoteVideos(sessionA.page, 2, 120_000);
    expect(decoding, 'A should decode video from B and from C').toBeGreaterThanOrEqual(2);
  });

  test('one member leaving does not end the call for the rest', async () => {
    test.setTimeout(180_000);
    await sessionC.page.getByTestId('call-leave').click();
    await expect(sessionC.page.getByTestId('call-stage')).toHaveCount(0, { timeout: 30_000 });

    // A and B carry on — including live media, not merely surviving UI.
    await expect(sessionA.page.getByTestId('call-stage')).toBeVisible();
    await expect(sessionB.page.getByTestId('call-stage')).toBeVisible();
    const stillDecoding = await waitForRemoteVideos(sessionB.page, 1, 60_000);
    expect(stillDecoding, 'B should still decode video from A').toBeGreaterThanOrEqual(1);
  });
});
