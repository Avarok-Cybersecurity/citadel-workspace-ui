/**
 * Messaging operations - send and verify messages
 */

import type { Page } from 'playwright';
import { takeScreenshot } from './screenshots.js';
import { UxIssueTracker } from './ux-tracker.js';

/**
 * Send a message in the current chat
 */
export async function sendMessage(
  page: Page,
  username: string,
  messageText: string,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Sending message ===`);

  // Bring tab to front
  await page.bringToFront();

  console.log(`  [DEBUG] Waiting for message input to be visible (5s timeout)...`);

  // Use waitFor with timeout instead of isVisible which doesn't timeout properly
  const messageInput = page.locator('input[placeholder*="message"]').first();

  try {
    await messageInput.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`  [DEBUG] Message input is now visible`);
  } catch (e) {
    console.log(`  [DEBUG] Message input not found or timed out: ${e}`);

    // Debug: Take screenshot and check what's visible
    await takeScreenshot(page, `${username}_message_input_NOT_FOUND`);
    const currentUrl = page.url();
    console.log(`  [DEBUG] Current URL: ${currentUrl}`);

    // Check for common issues
    const p2pChatVisible = await page.locator('[data-testid="p2p-chat"], .p2p-chat').first().isVisible().catch(() => false);
    console.log(`  [DEBUG] P2PChat visible: ${p2pChatVisible}`);

    const anyInput = await page.locator('input').count();
    console.log(`  [DEBUG] Total input elements on page: ${anyInput}`);

    const chatSection = await page.locator('[class*="chat"], [class*="message"], [class*="conversation"]').count();
    console.log(`  [DEBUG] Chat-related elements: ${chatSection}`);

    const modalVisible = await page.locator('[role="dialog"], .modal, [class*="modal"]').first().isVisible().catch(() => false);
    console.log(`  [DEBUG] Modal visible: ${modalVisible}`);

    if (uxTracker) {
      uxTracker.log('critical', 'functional', 'Message input not found');
    }
    return false;
  }

  console.log(`  [DEBUG] Checking if input is disabled...`);
  const isDisabled = await messageInput.isDisabled().catch(() => {
    console.log(`  [DEBUG] isDisabled check failed, assuming not disabled`);
    return false;
  });
  console.log(`  [DEBUG] isDisabled: ${isDisabled}`);

  if (isDisabled) {
    if (uxTracker) {
      uxTracker.log('major', 'functional', 'Message input is disabled');
    }
    await takeScreenshot(page, `${username}_input_disabled`);
    return false;
  }

  console.log(`  [DEBUG] Filling message text...`);
  await messageInput.fill(messageText);
  console.log(`  [DEBUG] Message text filled, waiting 500ms for UI to process...`);
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log(`  [DEBUG] Looking for send button...`);
  const sendBtn = page.locator('button[type="submit"]').last();

  const sendBtnVisible = await sendBtn.isVisible().catch(() => false);
  console.log(`  [DEBUG] Send button visible: ${sendBtnVisible}`);

  if (sendBtnVisible) {
    console.log(`  [DEBUG] Clicking send button...`);
    await sendBtn.click();
  } else {
    console.log(`  [DEBUG] Pressing Enter to send...`);
    await messageInput.press('Enter');
  }

  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log(`  Message sent: "${messageText}"`);
  await takeScreenshot(page, `${username}_message_sent`);
  return true;
}

/**
 * Verify a message was received in the chat
 * Uses proper Playwright waiting mechanisms for synchronization
 */
export async function verifyMessageReceived(
  page: Page,
  username: string,
  expectedText: string,
  timeout = 30000,
  uxTracker: UxIssueTracker | null = null
): Promise<boolean> {
  console.log(`\n=== ${username}: Verifying message received ===`);

  // Bring tab to front
  await page.bringToFront();

  console.log(`  Looking for: "${expectedText.substring(0, 50)}..."`);

  // Escape special regex characters in the expected text for use in selectors
  const escapedText = expectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    // Use Playwright's waitForFunction to wait for the message to appear in DOM
    // This is the most reliable synchronization mechanism
    await page.waitForFunction(
      (text: string) => {
        // Check all potential message containers
        const selectors = [
          '.prose',
          '[class*="message"]',
          '[class*="chat"]',
          '[class*="bubble"]',
          'p',
          'div',
        ];

        for (let i = 0; i < selectors.length; i++) {
          const elements = document.querySelectorAll(selectors[i]);
          for (let j = 0; j < elements.length; j++) {
            if (elements[j].textContent?.includes(text)) {
              return true;
            }
          }
        }
        return false;
      },
      expectedText,
      { timeout, polling: 500 }
    );

    console.log(`  ✓ Message found: "${expectedText.substring(0, 50)}..."`);
    await takeScreenshot(page, `${username}_message_verified`);
    return true;
  } catch {
    // waitForFunction timed out, try alternative methods
    console.log(`  waitForFunction timed out, trying alternative selectors...`);
  }

  // Alternative: Try multiple specific selectors with waitForSelector
  const messageSelectors = [
    `text="${expectedText}"`,
    `text=/${escapedText}/`,
    `.prose:has-text("${expectedText}")`,
    `p:has-text("${expectedText}")`,
    `div:has-text("${expectedText}")`,
    `[class*="message"]:has-text("${expectedText}")`,
  ];

  for (const selector of messageSelectors) {
    try {
      const element = page.locator(selector).first();
      await element.waitFor({ state: 'visible', timeout: 3000 });
      console.log(`  ✓ Message found with selector: ${selector.substring(0, 30)}...`);
      await takeScreenshot(page, `${username}_message_verified`);
      return true;
    } catch {
      // This selector didn't work, try next
    }
  }

  // Final fallback: Check page content directly
  const pageContent = await page.content();
  if (pageContent.includes(expectedText)) {
    console.log(`  ✓ Message found in page content (may not be visible)`);
    await takeScreenshot(page, `${username}_message_in_content`);
    return true;
  }

  // Debug: Log what IS visible in the chat area
  console.log(`  ✗ Message not found. Debugging chat content...`);
  try {
    const chatMessages = await page.locator('[class*="message"], .prose, [class*="chat"] p').allTextContents();
    console.log(`  Visible messages (${chatMessages.length}):`);
    chatMessages.slice(0, 5).forEach((msg, i) => {
      console.log(`    ${i + 1}. "${msg.substring(0, 60)}..."`);
    });
  } catch {
    console.log(`  Could not enumerate chat messages`);
  }

  if (uxTracker) {
    uxTracker.log('critical', 'functional', `Message not received within ${timeout}ms: "${expectedText}"`);
  }
  await takeScreenshot(page, `${username}_message_not_received`);
  return false;
}

/**
 * Verify that messages appear in the expected order in the chat
 * Returns an object with success status and details about each message
 */
export async function verifyMessageOrder(
  page: Page,
  username: string,
  expectedMessages: string[],
  timeout = 30000,
  uxTracker: UxIssueTracker | null = null
): Promise<{ success: boolean; details: { message: string; found: boolean; index: number }[] }> {
  console.log(`\n=== ${username}: Verifying message order ===`);
  console.log(`  Expecting ${expectedMessages.length} messages in order:`);
  expectedMessages.forEach((msg, i) => {
    console.log(`    ${i + 1}. "${msg.substring(0, 40)}${msg.length > 40 ? '...' : ''}"`);
  });

  const details: { message: string; found: boolean; index: number }[] = [];

  // Wait for all messages to appear first
  for (const msg of expectedMessages) {
    try {
      await page.waitForFunction(
        (text: string) => {
          const elements = document.querySelectorAll('.prose, [class*="message"], [class*="bubble"], p, div');
          for (let i = 0; i < elements.length; i++) {
            if (elements[i].textContent?.includes(text)) {
              return true;
            }
          }
          return false;
        },
        msg,
        { timeout, polling: 500 }
      );
    } catch {
      console.log(`  ✗ Message not found within timeout: "${msg.substring(0, 40)}..."`);
      if (uxTracker) {
        uxTracker.log('critical', 'functional', `Message not found: "${msg}"`);
      }
      details.push({ message: msg, found: false, index: -1 });
    }
  }

  // Now get all message elements and find their positions using Playwright locators
  // This is more reliable than page.evaluate() as it handles timing and context properly
  const allMessageTexts: string[] = [];
  const seen = new Set<string>();

  // Use 'p' selector since it finds the message text reliably
  const locator = page.locator('p');
  const count = await locator.count();

  for (let i = 0; i < count; i++) {
    const text = await locator.nth(i).textContent();
    if (text) {
      const trimmed = text.trim();
      // Filter out empty strings, very short strings, and duplicates
      if (trimmed.length > 10 && !seen.has(trimmed)) {
        seen.add(trimmed);
        allMessageTexts.push(trimmed);
      }
    }
  }

  console.log(`  Found ${allMessageTexts.length} message elements on page`);

  // Find the index of each expected message
  let lastFoundIndex = -1;
  let allInOrder = true;

  for (const expectedMsg of expectedMessages) {
    // Find the first occurrence of this message at or after lastFoundIndex
    let foundIndex = -1;
    for (let i = lastFoundIndex + 1; i < allMessageTexts.length; i++) {
      if (allMessageTexts[i].includes(expectedMsg)) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex === -1) {
      // Message not found at all, or not found after the previous message
      // Check if it exists anywhere (out of order)
      const existsAnywhere = allMessageTexts.some(t => t.includes(expectedMsg));
      if (existsAnywhere) {
        console.log(`  ✗ Message found but OUT OF ORDER: "${expectedMsg.substring(0, 40)}..."`);
        if (uxTracker) {
          uxTracker.log('major', 'functional', `Message out of order: "${expectedMsg}"`);
        }
      } else {
        console.log(`  ✗ Message NOT FOUND: "${expectedMsg.substring(0, 40)}..."`);
      }
      details.push({ message: expectedMsg, found: existsAnywhere, index: -1 });
      allInOrder = false;
    } else {
      console.log(`  ✓ Message at index ${foundIndex}: "${expectedMsg.substring(0, 40)}..."`);
      details.push({ message: expectedMsg, found: true, index: foundIndex });
      lastFoundIndex = foundIndex;
    }
  }

  if (allInOrder) {
    console.log(`  ✓ All ${expectedMessages.length} messages found in correct order`);
  } else {
    console.log(`  ✗ Message order verification FAILED`);
    await takeScreenshot(page, `${username}_message_order_failed`);
  }

  return { success: allInOrder, details };
}

/**
 * Wait for multiple messages to appear in the chat (reactive polling).
 * More efficient than sequential verifyMessageReceived calls - polls for all at once.
 *
 * @param page - The page to check
 * @param username - Username for logging
 * @param expectedMessages - Array of message texts to find
 * @param timeout - Total timeout in ms for ALL messages to appear
 * @param pollInterval - How often to check (default 500ms)
 * @returns Object with results for each message
 */
export async function waitForAllMessages(
  page: Page,
  username: string,
  expectedMessages: string[],
  timeout = 30000,
  pollInterval = 500
): Promise<{ allReceived: boolean; results: Record<string, boolean> }> {
  console.log(`\n=== ${username}: Waiting for ${expectedMessages.length} messages ===`);
  expectedMessages.forEach((msg, i) => {
    console.log(`  ${i + 1}. "${msg.substring(0, 50)}${msg.length > 50 ? '...' : ''}"`);
  });

  await page.bringToFront();

  const results: Record<string, boolean> = {};
  expectedMessages.forEach(msg => results[msg] = false);

  const startTime = Date.now();
  let found = 0;

  while (Date.now() - startTime < timeout && found < expectedMessages.length) {
    // Check page content for all remaining messages
    const pageContent = await page.content();

    for (const msg of expectedMessages) {
      if (!results[msg] && pageContent.includes(msg)) {
        results[msg] = true;
        found++;
        console.log(`  ✓ Found (${found}/${expectedMessages.length}): "${msg.substring(0, 40)}..."`);
      }
    }

    if (found < expectedMessages.length) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  const allReceived = found === expectedMessages.length;
  if (allReceived) {
    console.log(`  ✓ All ${expectedMessages.length} messages received in ${Date.now() - startTime}ms`);
  } else {
    console.log(`  ✗ Timeout after ${timeout}ms. Found ${found}/${expectedMessages.length} messages`);
    for (const msg of expectedMessages) {
      if (!results[msg]) {
        console.log(`    Missing: "${msg.substring(0, 50)}..."`);
      }
    }
    await takeScreenshot(page, `${username}_messages_timeout`);
  }

  return { allReceived, results };
}

/**
 * Verify that sent messages have been seen (read status - blue checkmarks).
 * This checks that the receiver has read the messages and sent back read receipts.
 *
 * @param page - The sender's page (the one who sent the messages)
 * @param username - Username for logging
 * @param expectedSeenCount - Number of messages expected to show "read" (blue checkmark) status
 * @param timeout - Timeout in ms to wait for status to update
 * @param uxTracker - Optional UX issue tracker
 * @returns Object with success status and count details
 */
export async function verifyMessagesSeen(
  page: Page,
  username: string,
  expectedSeenCount: number,
  timeout = 15000,
  uxTracker: UxIssueTracker | null = null
): Promise<{ success: boolean; seenCount: number; deliveredCount: number; sentCount: number }> {
  console.log(`\n=== ${username}: Verifying messages seen (read status) ===`);
  console.log(`  Expecting ${expectedSeenCount} messages with "read" status (blue checkmarks)`);

  const startTime = Date.now();
  let seenCount = 0;
  let deliveredCount = 0;
  let sentCount = 0;

  // Poll until we get the expected seen count or timeout
  while (Date.now() - startTime < timeout) {
    // Count status indicators using data-testid attributes
    seenCount = await page.locator('[data-testid="message-status-read"]').count();
    deliveredCount = await page.locator('[data-testid="message-status-delivered"]').count();
    sentCount = await page.locator('[data-testid="message-status-sent"]').count();

    console.log(`  Status counts: read=${seenCount}, delivered=${deliveredCount}, sent=${sentCount}`);

    if (seenCount >= expectedSeenCount) {
      console.log(`  ✓ Found ${seenCount} messages with "read" status (expected ${expectedSeenCount})`);
      await takeScreenshot(page, `${username}_messages_seen_verified`);
      return { success: true, seenCount, deliveredCount, sentCount };
    }

    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Timeout - didn't get expected seen count
  console.log(`  ✗ Timeout waiting for messages to be seen`);
  console.log(`  Final counts: read=${seenCount}, delivered=${deliveredCount}, sent=${sentCount}`);

  if (uxTracker) {
    uxTracker.log(
      'critical',
      'functional',
      `Messages not marked as seen within ${timeout}ms. Expected ${expectedSeenCount} read, got ${seenCount}. Delivered: ${deliveredCount}, Sent: ${sentCount}`
    );
  }

  await takeScreenshot(page, `${username}_messages_not_seen`);
  return { success: false, seenCount, deliveredCount, sentCount };
}
