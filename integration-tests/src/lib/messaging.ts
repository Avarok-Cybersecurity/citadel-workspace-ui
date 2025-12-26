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

  const messageInput = page.locator('input[placeholder*="message"]').first();

  if (!await messageInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    if (uxTracker) {
      uxTracker.log('critical', 'functional', 'Message input not found');
    }
    return false;
  }

  const isDisabled = await messageInput.isDisabled();
  if (isDisabled) {
    if (uxTracker) {
      uxTracker.log('major', 'functional', 'Message input is disabled');
    }
    await takeScreenshot(page, `${username}_input_disabled`);
    return false;
  }

  await messageInput.fill(messageText);
  await new Promise(resolve => setTimeout(resolve, 300));

  const sendBtn = page.locator('button[type="submit"]').last();
  if (await sendBtn.isVisible()) {
    await sendBtn.click();
  } else {
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
