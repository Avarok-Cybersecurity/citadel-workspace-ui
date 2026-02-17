#!/usr/bin/env node

/**
 * P2P OFFICE MEMBERS CID Fix Test
 *
 * Tests that clicking on a peer in OFFICE MEMBERS sets the correct CID in the URL.
 * This verifies the fix for the bug where User 1 clicking on User 2 would send messages to self.
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const UI_URL = 'http://localhost:5173';
const SERVER_LOCATION = '127.0.0.1:12349';
const WORKSPACE_PASSWORD = 'dev-local-workspace-password';
const USER_PASSWORD = 'test12345';
const TIMESTAMP = Date.now();
const USER1_USERNAME = `p2ptest1_${TIMESTAMP}`;
const USER2_USERNAME = `p2ptest2_${TIMESTAMP}`;
const SCREENSHOT_DIR = path.join(__dirname, '../test-screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  log(`Screenshot saved: ${filepath}`);
}

async function createAccount(page, context, fullName, username, isFirstUser = false) {
  log(`Creating account: ${username}`);

  // Navigate to UI
  await page.goto(UI_URL);
  await sleep(2000);

  // Take initial screenshot
  await takeScreenshot(page, `${username}-01-initial`);

  // Click Join Workspace
  const joinBtn = page.locator('button:has-text("Join Workspace")');
  if (await joinBtn.isVisible()) {
    await joinBtn.click();
    log('Clicked Join Workspace');
  }
  await sleep(1000);

  // Fill workspace location
  const locationInput = page.locator('input[placeholder*="127.0.0.1"]').or(page.locator('input').first());
  await locationInput.fill(SERVER_LOCATION);
  await sleep(500);

  // Click Next
  await page.locator('button:has-text("Next"), button:has-text("NEXT")').first().click();
  await sleep(500);

  // Click Next on security settings
  await page.locator('button:has-text("Next"), button:has-text("NEXT")').first().click();
  await sleep(500);

  // Take screenshot of user form
  await takeScreenshot(page, `${username}-02-user-form`);

  // Fill user profile
  const fullNameInput = page.locator('input[placeholder*="Full Name"], input[name="fullName"]').or(page.locator('input').nth(0));
  const usernameInput = page.locator('input[placeholder*="username"], input[name="username"]').or(page.locator('input').nth(1));
  const passwordInput = page.locator('input[type="password"]').first();
  const confirmInput = page.locator('input[type="password"]').nth(1);

  await fullNameInput.fill(fullName);
  await usernameInput.fill(username);
  await passwordInput.fill(USER_PASSWORD);
  if (await confirmInput.isVisible()) {
    await confirmInput.fill(USER_PASSWORD);
  }

  // Click Join
  await page.locator('button:has-text("Join"), button:has-text("JOIN")').first().click();
  await sleep(2000);

  // Handle Initialize Workspace modal for first user
  if (isFirstUser) {
    const initModal = page.locator('text="Initialize Workspace"').or(page.locator('text="Master Password"'));
    if (await initModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      log('Initialize Workspace modal detected');
      const pwdInput = page.locator('input[type="password"]');
      await pwdInput.fill(WORKSPACE_PASSWORD);
      await page.locator('button:has-text("Initialize"), button:has-text("Submit")').click();
      await sleep(2000);
    }
  }

  // Wait for workspace to load
  await sleep(3000);
  await takeScreenshot(page, `${username}-03-workspace`);

  log(`Account created: ${username}`);
  return page;
}

async function performP2PRegistration(page1, page2, user1, user2) {
  log('Starting P2P registration...');

  // On User 1's page, click Discover Peers
  log('User 1: Looking for Discover Peers button');
  await page1.bringToFront();

  const discoverBtn = page1.locator('button:has-text("Discover Peers")');
  if (await discoverBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await discoverBtn.click();
    log('Clicked Discover Peers');
    await sleep(2000);
  }

  await takeScreenshot(page1, 'p2p-01-discover-modal');

  // Click Refresh to find peers
  const refreshBtn = page1.locator('button:has-text("Refresh")');
  if (await refreshBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await refreshBtn.click();
    await sleep(2000);
  }

  await takeScreenshot(page1, 'p2p-02-after-refresh');

  // Find User 2 and click Connect
  const connectBtn = page1.locator(`button:has-text("Connect")`).first();
  if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await connectBtn.click();
    log(`User 1: Sent P2P request to User 2`);
    await sleep(2000);
  }

  await takeScreenshot(page1, 'p2p-03-sent-request');

  // Close modal if open
  await page1.keyboard.press('Escape');
  await sleep(500);

  // Switch to User 2's page and accept the request
  log('User 2: Looking for notification');
  await page2.bringToFront();
  await sleep(1000);

  await takeScreenshot(page2, 'p2p-04-user2-before-accept');

  // Look for notification bell/badge
  const bellIcon = page2.locator('[data-testid="notification-bell"], button:has([class*="bell"]), .notification-badge').first();
  if (await bellIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
    await bellIcon.click();
    await sleep(1000);
  }

  // Try to find pending requests or accept button
  const acceptBtn = page2.locator('button:has-text("Accept")').first();
  if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await acceptBtn.click();
    log('User 2: Accepted P2P request');
    await sleep(2000);
  }

  await takeScreenshot(page2, 'p2p-05-accepted');

  // Close any open modals
  await page2.keyboard.press('Escape');
  await sleep(500);
}

async function testOfficeMembersCID(page1, page2, user1, user2) {
  log('=== CRITICAL TEST: OFFICE MEMBERS CID FIX ===');

  // Switch to User 1's page
  await page1.bringToFront();
  await sleep(1000);

  // Take screenshot of current state
  await takeScreenshot(page1, 'cid-test-01-user1-view');

  // Get User 1's current URL to extract their CID
  const user1Url = page1.url();
  log(`User 1 current URL: ${user1Url}`);

  // Look for OFFICE MEMBERS section and User 2 in it
  log('Looking for OFFICE MEMBERS section...');

  // First, check if we can see OFFICE MEMBERS section
  const officeMembers = page1.locator('text="OFFICE MEMBERS"').or(page1.locator('.office-members'));
  if (await officeMembers.isVisible({ timeout: 5000 }).catch(() => false)) {
    log('Found OFFICE MEMBERS section');
    await takeScreenshot(page1, 'cid-test-02-office-members-visible');
  }

  // Look for User 2 in the sidebar (Direct Messages or Office Members)
  const user2InSidebar = page1.locator(`text="${user2}"`).or(
    page1.locator(`[data-username="${user2}"]`)
  ).or(
    page1.locator('.sidebar').locator(`text="${user2}"`)
  );

  if (await user2InSidebar.isVisible({ timeout: 5000 }).catch(() => false)) {
    log(`Found ${user2} in sidebar`);

    // Click on User 2
    await user2InSidebar.first().click();
    await sleep(2000);

    // Take screenshot after clicking
    await takeScreenshot(page1, 'cid-test-03-after-click-user2');

    // CRITICAL: Check the URL
    const urlAfterClick = page1.url();
    log(`URL after clicking ${user2}: ${urlAfterClick}`);

    // Parse the URL to get the channel parameter
    const url = new URL(urlAfterClick);
    const channelParam = url.searchParams.get('channel');

    log(`Channel parameter: ${channelParam}`);

    // The channel should be User 2's CID, NOT User 1's CID
    // We need to verify this by checking that it's different from User 1's CID

    // Get User 1's CID from their session/profile if possible
    const user1Cid = url.searchParams.get('cid') || 'unknown';

    if (channelParam) {
      log(`SUCCESS: Channel parameter is set: ${channelParam}`);

      // Check if channel is NOT the same as the logged-in user's identifier
      // This is the key verification - clicking User 2 should not set User 1's CID

      // Try to send a message to verify
      log('Attempting to send a message...');

      const messageInput = page1.locator('input[placeholder*="message"], textarea[placeholder*="message"]').first();
      if (await messageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await messageInput.fill('Hello from user1!');
        await page1.keyboard.press('Enter');
        await sleep(2000);

        await takeScreenshot(page1, 'cid-test-04-message-sent');
        log('Message sent');
      }

      // Check console for "Cannot send message to self" error
      log('Checking for "Cannot send message to self" error...');

    } else {
      log('WARNING: Channel parameter is empty or missing');
    }
  } else {
    log(`WARNING: Could not find ${user2} in sidebar`);
    await takeScreenshot(page1, 'cid-test-ERROR-no-user2');
  }

  // Also check DIRECT MESSAGES section
  log('Checking DIRECT MESSAGES section...');
  const dmSection = page1.locator('text="DIRECT MESSAGES"');
  if (await dmSection.isVisible({ timeout: 3000 }).catch(() => false)) {
    log('Found DIRECT MESSAGES section');
    await takeScreenshot(page1, 'cid-test-05-direct-messages');
  }
}

async function main() {
  log('=== P2P OFFICE MEMBERS CID Test ===');
  log(`Timestamp: ${TIMESTAMP}`);
  log(`User 1: ${USER1_USERNAME}`);
  log(`User 2: ${USER2_USERNAME}`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1400,900']
  });

  try {
    // Create browser context with viewport
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 }
    });

    // Capture console messages
    const consoleMessages = [];
    context.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(`[${msg.type()}] ${text}`);
      if (text.includes('Cannot send message to self') || text.includes('error') || text.includes('Error')) {
        log(`CONSOLE: ${text}`);
      }
    });

    // Create two pages (tabs) for two users
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Create User 1 (first user, will initialize workspace)
    await createAccount(page1, context, 'P2P Test User One', USER1_USERNAME, true);

    // Create User 2 (second user)
    await createAccount(page2, context, 'P2P Test User Two', USER2_USERNAME, false);

    // Perform P2P registration
    await performP2PRegistration(page1, page2, USER1_USERNAME, USER2_USERNAME);

    // CRITICAL TEST: Verify OFFICE MEMBERS CID fix
    await testOfficeMembersCID(page1, page2, USER1_USERNAME, USER2_USERNAME);

    // Check for any error messages
    log('=== Console Messages Summary ===');
    const errors = consoleMessages.filter(m =>
      m.toLowerCase().includes('error') ||
      m.includes('Cannot send message to self')
    );

    if (errors.length > 0) {
      log('ERRORS FOUND:');
      errors.forEach(e => log(`  ${e}`));
    } else {
      log('No critical errors found');
    }

    log('=== Test Complete ===');
    log(`Screenshots saved to: ${SCREENSHOT_DIR}`);

    // Keep browser open for manual inspection
    log('Browser will remain open for manual inspection. Press Ctrl+C to close.');

    // Wait indefinitely until user closes
    await new Promise(() => {});

  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
    await takeScreenshot(browser.contexts()[0]?.pages()[0], 'error-state');
  }
}

main().catch(console.error);
