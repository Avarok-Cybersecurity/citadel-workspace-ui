/**
 * Under a Strict messaging trust policy a chat opened with someone you are not registered with
 * says so and offers the connect request; nothing goes out unprompted, and the peer is asked.
 *
 * The admin sets Strict and the policy is restored in `finally`: every spec in a shard shares one
 * backend, and the rest assume the default.
 */
import { expect } from '@playwright/test';
import { adminMemberTest as test } from '../fixtures/multi-user.fixture.js';
import { acceptP2PRequest } from '../lib/index.js';
import { openChatFromMemberList, setWorkspaceTrust } from './messaging-trust-helpers.js';

test('under Strict the chat offers the request and the peer accepts it', async ({ admin, member }) => {
  test.setTimeout(420_000);
  await setWorkspaceTrust(admin.page, 'Strict');
  try {
    await openChatFromMemberList(admin.page, member.username);

    const banner = admin.page.getByTestId('p2p-connect-banner');
    await expect(banner).toHaveAttribute('data-stage', 'offer', { timeout: 30_000 });
    await expect(banner).toContainText("aren't connected");
    await expect(admin.page.getByTestId('p2p-message-input')).toHaveAttribute('placeholder', /^Connect with /);

    await admin.page.getByTestId('p2p-connect-request').click();
    await expect(banner).toHaveAttribute('data-stage', 'waiting', { timeout: 30_000 });

    // The badge path only: under Strict the member must be asked.
    expect(await acceptP2PRequest(member.page, member.username), 'the member is shown the request').toBe(true);
    await expect(banner).toHaveCount(0, { timeout: 90_000 });
    await expect(admin.page.getByTestId('p2p-message-input')).toHaveAttribute('placeholder', 'Type a message...');
  } finally {
    await setWorkspaceTrust(admin.page, 'AllTrusted');
  }
});
