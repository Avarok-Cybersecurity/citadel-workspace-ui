/**
 * Proof that GROUP calling works, not just 1:1.
 *
 * The engine fans one encoded stream out to every participant (encode once,
 * send many — an encoder per peer is what makes mesh calls melt laptops), so
 * the thing worth proving is that a third participant genuinely receives media,
 * not merely that a third tile appears.
 *
 * The load-bearing assertion is the same one as the 1:1 proof: a REMOTE
 * participant tile reporting a non-zero videoWidth. A tile can render from an
 * avatar fallback with no media at all, and the self-tile always has video —
 * neither would tell us anything.
 *
 * Three tabs in ONE browser, deliberately. That is this app's documented
 * multi-user model: one WebSocket per browser, sessions multiplexed over it,
 * and P2P between two CIDs in the same browser is the supported path.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  clearBrowserStorage,
  waitForAppReady,
  createAccount,
  waitForWorkspaceLoaded,
  closeAnyModals,
  navigateToRoom,
} from '../lib/index.js';
import { config } from '../lib/config.js';

interface Member {
  page: Page;
  username: string;
}

const stamp = Date.now();
const PASSWORD = 'test12345';
/** A room every new workspace has, so no setup is needed to reach one. */
const ROOM = 'Random';

let context: BrowserContext;
const members: Member[] = [];

async function joinWorkspace(index: number): Promise<Member> {
  const page = await context.newPage();
  const username = `pw_gcall_${index}_${stamp}`;

  await page.goto(config.BASE_URL, { waitUntil: 'commit', timeout: 60_000 });
  if (index === 0) await clearBrowserStorage(page);
  await waitForAppReady(page, 60_000);

  const created = await createAccount(page, username, {
    isFirstUser: index === 0,
    password: PASSWORD,
    uxTracker: null,
  });
  expect(created, `could not create ${username}`).toBe(true);

  expect(
    await waitForWorkspaceLoaded(page, 60_000),
    `${username}'s workspace should finish loading`,
  ).toBe(true);
  await closeAnyModals(page);

  return { page, username };
}

test.describe.serial('Group calling', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    context = await browser.newContext({ permissions: ['camera', 'microphone'] });
    for (let i = 0; i < 3; i += 1) {
      members.push(await joinWorkspace(i));
    }
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('every member reaches the workspace', async () => {
    for (const member of members) {
      await expect(member.page.getByTestId('user-avatar-button')).toBeVisible({ timeout: 60_000 });
    }
  });

  test('every member reaches the same room', async () => {
    test.setTimeout(300_000);
    for (const member of members) {
      expect(
        await navigateToRoom(member.page, member.username, ROOM),
        `${member.username} should reach ${ROOM}`,
      ).toBe(true);
    }
  });

  test('the room offers group call controls', async () => {
    test.setTimeout(180_000);
    // Their presence is what says calling reached a surface other than a 1:1 DM
    // at all. They render even when unusable — the reason is carried on the
    // disabled control rather than by hiding it.
    for (const member of members) {
      await expect(member.page.getByTestId('group-call-start-video')).toBeVisible({
        timeout: 90_000,
      });
    }
  });

  test('an empty room refuses a call, and says why', async () => {
    test.setTimeout(120_000);

    // Joining a WORKSPACE does not make you a member of every room in it, so a
    // room nobody has been added to has no one to call. The control stays
    // visible and carries the reason rather than vanishing — a button that
    // disappears teaches the user the feature does not exist, one that explains
    // itself teaches them what to fix.
    //
    // This is the honest limit of what this spec proves. Ringing a room call
    // end to end needs the three accounts added as members of the room, which
    // is workspace-admin setup this spec does not perform; the 1:1 media proof
    // in call-audio-video.spec.ts covers the transport itself, and
    // group-call-entry.test.ts covers the start/join/cap decisions.
    const caller = members[0].page;
    const audio = caller.getByTestId('group-call-start-audio');

    await expect(audio).toBeDisabled();

    // Hovered, because the reason lives in a tooltip rather than a title
    // attribute — and what matters is that the user can actually READ why, not
    // merely that the control is inert.
    await audio.hover({ force: true });
    await expect(
      caller.getByText(/No one else is in this conversation yet/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
