/**
 * Shared setup for the call specs.
 *
 * Not a spec — Playwright collects only `*.spec.ts`, so this file is imported,
 * never run. It lives here rather than in `lib/` because it asserts, and the
 * helpers in `lib/` deliberately return booleans instead of importing `expect`.
 */

import { expect, type Page } from '@playwright/test';
import {
  acceptP2PRequest,
  openConversation,
  p2pRegister,
  sendAndVerifyMessage,
  waitForP2PChannelReady,
} from '../lib/index.js';

/** Structurally satisfied by each call spec's own session object. */
export interface PeerSession {
  page: Page;
  username: string;
}

/**
 * Register two peers and leave both directions genuinely warm.
 *
 * Order matters, and getting it wrong is subtle. Channel readiness is proven by
 * message RECEIPT, so waiting for it before either side can send is waiting for
 * something nothing will cause: the initiator gets its proof from the accept
 * traffic, and the acceptor, with nothing inbound, polls until it times out.
 * That was the recurring failure in the 1:1 call spec, and it surfaced two
 * tests later as "calling never became available" rather than at its cause.
 *
 * So: open both conversations first, then send a verified message each way.
 * The warmup both establishes the channel and IS the readiness proof, which
 * makes the explicit checks afterwards immediate rather than hopeful.
 */
export async function connectPair(
  initiator: PeerSession,
  acceptor: PeerSession,
): Promise<void> {
  await p2pRegister(initiator.page, initiator.username, acceptor.username);
  await acceptP2PRequest(acceptor.page, acceptor.username);

  // Both sides into the conversation, so warmup messages can be typed and seen.
  expect(await openConversation(initiator.page, initiator.username, acceptor.username)).toBe(true);
  expect(await openConversation(acceptor.page, acceptor.username, initiator.username)).toBe(true);

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
