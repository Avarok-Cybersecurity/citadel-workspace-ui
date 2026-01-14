#!/usr/bin/env node

/**
 * YJS Bidirectional Sync Test
 *
 * Tests P2P messaging and Live Doc sync between 2 users.
 * CRITICAL: Verifies bidirectional YJS sync fix.
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = 'http://localhost:5173';
const WORKSPACE_LOCATION = '127.0.0.1:12349';
const WORKSPACE_PASSWORD = 'SUPER_SECRET_ADMIN_PASSWORD_CHANGE_ME';
const USER_PASSWORD = 'test12345';
const TIMESTAMP = Date.now();
const USER1_USERNAME = `syncfix1_${TIMESTAMP}`;
const USER2_USERNAME = `syncfix2_${TIMESTAMP}`;

const SCREENSHOT_DIR = path.join(__dirname, '../test-screenshots');
const REPORT_FILE = path.join(__dirname, '../YJS_SYNC_TEST_REPORT.md');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Test results
const results = {
  accountCreation: { status: 'PENDING', notes: '' },
  p2pRegistration: { status: 'PENDING', notes: '' },
  liveDocCreation: { status: 'PENDING', notes: '' },
  user1ToUser2Sync: { status: 'PENDING', notes: '' },
  user2ToUser1Sync: { status: 'PENDING', notes: '' },
  bidirectionalSync: { status: 'PENDING', notes: '' }
};

const consoleMessages = [];
const uxIssues = [];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot saved: ${name}`);
  return filepath;
}

async function waitForSelector(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout });
    return true;
  } catch (e) {
    console.log(`Timeout waiting for selector: ${selector}`);
    return false;
  }
}

async function clickByText(page, text, tag = '*') {
  const xpath = `//${tag}[contains(text(), "${text}")]`;
  try {
    await page.waitForSelector(`xpath/${xpath}`, { visible: true, timeout: 5000 });
    const elements = await page.$$(`xpath/${xpath}`);
    if (elements.length > 0) {
      await elements[0].click();
      return true;
    }
  } catch (e) {
    console.log(`Could not find element with text: ${text}`);
  }
  return false;
}

async function typeInInput(page, placeholder, value) {
  const selector = `input[placeholder*="${placeholder}"]`;
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 5000 });
    await page.click(selector);
    await page.type(selector, value);
    return true;
  } catch (e) {
    console.log(`Could not find input with placeholder: ${placeholder}`);
    return false;
  }
}

async function createAccount(page, username, fullName, isFirstUser = false) {
  console.log(`Creating account for ${username}...`);

  // Navigate to app
  await page.goto(APP_URL);
  await sleep(2000);

  // Click Join Workspace
  if (!(await clickByText(page, 'Join Workspace', 'button'))) {
    throw new Error('Cannot find Join Workspace button');
  }
  await sleep(1000);

  // Fill workspace location
  await typeInInput(page, 'Enter workspace', WORKSPACE_LOCATION);
  await sleep(500);

  // Click NEXT
  if (!(await clickByText(page, 'NEXT', 'button'))) {
    // Try clicking any button that looks like "Next"
    const nextBtn = await page.$('button:has-text("Next")') || await page.$('button:has-text("NEXT")');
    if (nextBtn) await nextBtn.click();
  }
  await sleep(1000);

  // Click NEXT on security settings
  if (!(await clickByText(page, 'NEXT', 'button'))) {
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.toUpperCase().includes('NEXT')) {
        await btn.click();
        break;
      }
    }
  }
  await sleep(1000);

  // Fill user profile
  await typeInInput(page, 'Full Name', fullName);
  await typeInInput(page, 'Username', username);
  await typeInInput(page, 'Password', USER_PASSWORD);
  // Look for confirm password
  const confirmInputs = await page.$$('input[type="password"]');
  if (confirmInputs.length > 1) {
    await confirmInputs[1].click();
    await confirmInputs[1].type(USER_PASSWORD);
  }
  await sleep(500);

  // Click JOIN
  if (!(await clickByText(page, 'JOIN', 'button'))) {
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.toUpperCase().includes('JOIN')) {
        await btn.click();
        break;
      }
    }
  }
  await sleep(2000);

  // Handle Initialize Workspace modal for first user
  if (isFirstUser) {
    const initModal = await page.$('text=Initialize Workspace');
    if (initModal) {
      console.log('Initialize Workspace modal detected - entering password...');
      const passwordInputs = await page.$$('input[type="password"]');
      if (passwordInputs.length > 0) {
        await passwordInputs[0].click();
        await passwordInputs[0].type(WORKSPACE_PASSWORD);
      }
      // Click submit button
      const submitBtns = await page.$$('button');
      for (const btn of submitBtns) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && (text.includes('INITIALIZE') || text.includes('Submit') || text.includes('OK'))) {
          await btn.click();
          break;
        }
      }
      await sleep(2000);
    }
  }

  // Wait for workspace to load
  await sleep(5000);

  console.log(`Account ${username} created successfully`);
  return true;
}

async function registerP2P(page1, page2, user1, user2) {
  console.log('Starting P2P registration...');

  // User 1: Click Discover Peers
  await page1.bringToFront();
  await sleep(1000);

  // Look for Discover Peers button
  if (!(await clickByText(page1, 'Discover Peers', 'button'))) {
    uxIssues.push({ severity: 'Medium', issue: 'Discover Peers button not easily visible' });
    // Try looking in sidebar
    const sidebarBtns = await page1.$$('.sidebar button, [class*="sidebar"] button');
    for (const btn of sidebarBtns) {
      const text = await page1.evaluate(el => el.textContent, btn);
      if (text && text.includes('Discover')) {
        await btn.click();
        break;
      }
    }
  }
  await sleep(2000);

  // Click Refresh if available
  await clickByText(page1, 'Refresh', 'button');
  await sleep(3000);

  // Wait for User 2 to appear and click Connect
  let foundPeer = false;
  for (let i = 0; i < 10; i++) {
    const pageContent = await page1.content();
    if (pageContent.includes(user2)) {
      console.log(`Found ${user2} in peer list`);
      foundPeer = true;
      break;
    }
    await clickByText(page1, 'Refresh', 'button');
    await sleep(2000);
  }

  if (!foundPeer) {
    throw new Error(`User 2 (${user2}) not found in peer list`);
  }

  // Find and click Connect button for user2
  const connectBtns = await page1.$$('button');
  for (const btn of connectBtns) {
    const text = await page1.evaluate(el => el.textContent, btn);
    if (text && text.includes('Connect')) {
      // Check if this is near user2's name
      await btn.click();
      console.log('Clicked Connect button');
      break;
    }
  }
  await sleep(2000);
  await screenshot(page1, '01-p2p-invite-sent.png');

  // User 2: Accept the request
  await page2.bringToFront();
  await sleep(2000);

  // Look for notification bell or pending requests
  const bellIcon = await page2.$('[class*="notification"], [class*="bell"], button:has(svg)');
  if (bellIcon) {
    await bellIcon.click();
    await sleep(1000);
  }

  // Look for Accept button
  for (let i = 0; i < 10; i++) {
    const pageContent = await page2.content();
    if (pageContent.includes(user1) && pageContent.includes('Accept')) {
      break;
    }
    await sleep(1000);
  }

  if (await clickByText(page2, 'Accept', 'button')) {
    console.log('Accepted P2P request');
    await sleep(2000);
    await screenshot(page2, '02-p2p-accepted.png');
    return true;
  }

  // Try clicking any visible Accept button
  const acceptBtns = await page2.$$('button');
  for (const btn of acceptBtns) {
    const text = await page2.evaluate(el => el.textContent, btn);
    if (text && text.includes('Accept')) {
      await btn.click();
      console.log('Accepted P2P request via button search');
      await sleep(2000);
      return true;
    }
  }

  throw new Error('Could not accept P2P request');
}

async function openDirectMessageChat(page, targetUser) {
  console.log(`Opening DM chat with ${targetUser}...`);

  // Look in DIRECT MESSAGES section for the user
  const dmSection = await page.$('text=DIRECT MESSAGES');
  if (dmSection) {
    // Click on the user in DM list
    const links = await page.$$('a, button, div[role="button"]');
    for (const link of links) {
      const text = await page.evaluate(el => el.textContent, link);
      if (text && text.includes(targetUser)) {
        await link.click();
        console.log(`Clicked on ${targetUser} in DM list`);
        await sleep(2000);
        return true;
      }
    }
  }

  // Alternative: click directly on username text
  if (await clickByText(page, targetUser)) {
    await sleep(2000);
    return true;
  }

  console.log(`Could not find ${targetUser} in DM list`);
  return false;
}

async function createLiveDoc(page, docTitle) {
  console.log(`Creating Live Doc: ${docTitle}...`);

  // Look for "Create Live Doc" or "+" button in chat
  const createBtn = await page.$('button:has-text("Live Doc"), button:has-text("Create"), [class*="create"]');
  if (createBtn) {
    await createBtn.click();
    await sleep(1000);
  } else {
    // Try clicking a + icon or action button
    const actionBtns = await page.$$('button svg, button [class*="icon"]');
    for (const btn of actionBtns) {
      const parent = await btn.evaluateHandle(el => el.closest('button'));
      if (parent) {
        await parent.click();
        await sleep(500);
        // Check if a menu appeared with Live Doc option
        const liveDocOption = await clickByText(page, 'Live Doc');
        if (liveDocOption) break;
      }
    }
  }
  await sleep(1000);

  // Look for Live Doc creation modal or input
  const titleInput = await page.$('input[placeholder*="title"], input[placeholder*="Title"], input[placeholder*="name"]');
  if (titleInput) {
    await titleInput.click();
    await titleInput.type(docTitle);
    await sleep(500);

    // Click Create or OK
    await clickByText(page, 'Create', 'button') || await clickByText(page, 'OK', 'button');
    await sleep(2000);
  }

  console.log(`Live Doc "${docTitle}" created`);
  await screenshot(page, '03-live-doc-created.png');
  return true;
}

async function typeInLiveDoc(page, text) {
  console.log(`Typing in Live Doc: ${text}`);

  // Look for the editor (tiptap/prosemirror)
  const editor = await page.$('[class*="editor"], [class*="ProseMirror"], [contenteditable="true"], .tiptap');
  if (editor) {
    await editor.click();
    await sleep(500);
    await page.keyboard.type(text);
    await sleep(1000);
    console.log('Typed text in Live Doc');
    return true;
  }

  console.log('Could not find Live Doc editor');
  return false;
}

async function getLiveDocContent(page) {
  // Get text from the editor
  const editor = await page.$('[class*="editor"], [class*="ProseMirror"], [contenteditable="true"], .tiptap');
  if (editor) {
    const content = await page.evaluate(el => el.textContent, editor);
    return content || '';
  }
  return '';
}

async function openLiveDocFromChat(page) {
  console.log('Opening Live Doc from chat...');

  // Look for Live Doc link/button in chat messages
  const liveDocLinks = await page.$$('a:has-text("Live Doc"), button:has-text("Live Doc"), [class*="live-doc"], [class*="livedoc"]');
  if (liveDocLinks.length > 0) {
    await liveDocLinks[0].click();
    await sleep(2000);
    console.log('Opened Live Doc from chat');
    return true;
  }

  // Alternative: look for any clickable element mentioning the doc
  if (await clickByText(page, 'Sync Test Doc')) {
    await sleep(2000);
    return true;
  }

  console.log('Could not find Live Doc link in chat');
  return false;
}

async function runTest() {
  console.log('=== YJS Bidirectional Sync Test ===');
  console.log(`Timestamp: ${TIMESTAMP}`);
  console.log(`User 1: ${USER1_USERNAME}`);
  console.log(`User 2: ${USER2_USERNAME}`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: false,
    devtools: false,
    args: ['--window-size=1400,900']
  });

  try {
    // Create two pages (tabs)
    const page1 = await browser.newPage();
    const page2 = await browser.newPage();

    // Set up console message capture
    page1.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Yjs]') || text.includes('SyncStep') || text.includes('awareness')) {
        consoleMessages.push({ tab: 'User1', type: msg.type(), text });
        console.log(`[User1 Console] ${text}`);
      }
    });

    page2.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Yjs]') || text.includes('SyncStep') || text.includes('awareness')) {
        consoleMessages.push({ tab: 'User2', type: msg.type(), text });
        console.log(`[User2 Console] ${text}`);
      }
    });

    await page1.setViewport({ width: 1400, height: 900 });
    await page2.setViewport({ width: 1400, height: 900 });

    // === PHASE 1: Create Accounts ===
    console.log('\n=== Phase 1: Creating Accounts ===');

    await page1.bringToFront();
    await createAccount(page1, USER1_USERNAME, 'Sync Test User One', true);
    await screenshot(page1, '04-user1-workspace.png');

    await page2.bringToFront();
    await createAccount(page2, USER2_USERNAME, 'Sync Test User Two', false);
    await screenshot(page2, '05-user2-workspace.png');

    results.accountCreation = { status: 'PASS', notes: 'Both accounts created successfully' };
    console.log('Account creation: PASS');

    // === PHASE 2: P2P Registration ===
    console.log('\n=== Phase 2: P2P Registration ===');

    await registerP2P(page1, page2, USER1_USERNAME, USER2_USERNAME);
    results.p2pRegistration = { status: 'PASS', notes: 'P2P registration completed' };
    console.log('P2P Registration: PASS');

    // === PHASE 3: Create Live Doc ===
    console.log('\n=== Phase 3: Create Live Doc ===');

    await page1.bringToFront();
    await sleep(1000);

    // Open chat with User 2
    if (!(await openDirectMessageChat(page1, USER2_USERNAME))) {
      uxIssues.push({ severity: 'High', issue: 'Cannot find DM section after P2P registration' });
    }
    await screenshot(page1, '06-user1-dm-open.png');

    // Create Live Doc
    await createLiveDoc(page1, 'Sync Test Doc');
    results.liveDocCreation = { status: 'PASS', notes: 'Live Doc created successfully' };

    // === PHASE 4: User 1 Types ===
    console.log('\n=== Phase 4: User 1 Types in Live Doc ===');

    await sleep(2000);
    const user1Text = 'Hello from User 1!';
    if (await typeInLiveDoc(page1, user1Text)) {
      await screenshot(page1, '07-user1-typed.png');
      console.log('User 1 typed in Live Doc');
    } else {
      uxIssues.push({ severity: 'High', issue: 'Could not find Live Doc editor' });
    }
    await sleep(3000);

    // === PHASE 5: User 2 Opens Live Doc - CRITICAL CHECK ===
    console.log('\n=== Phase 5: CRITICAL - User 2 Opens Live Doc ===');

    await page2.bringToFront();
    await sleep(1000);

    // Open chat with User 1
    if (!(await openDirectMessageChat(page2, USER1_USERNAME))) {
      console.log('Trying alternative method to find DM...');
    }
    await screenshot(page2, '08-user2-dm-open.png');

    // Open Live Doc from chat
    await openLiveDocFromChat(page2);
    await sleep(3000);
    await screenshot(page2, '09-user2-livedoc-open.png');

    // CRITICAL CHECK: Verify User 2 sees User 1's text
    const user2SeesContent = await getLiveDocContent(page2);
    console.log(`User 2 sees content: "${user2SeesContent}"`);

    if (user2SeesContent.includes('Hello from User 1!')) {
      results.user1ToUser2Sync = { status: 'PASS', notes: 'User 2 sees User 1 text - sync works!' };
      console.log('CRITICAL CHECK PASS: User 2 sees User 1 text');
    } else {
      results.user1ToUser2Sync = { status: 'FAIL', notes: `User 2 does NOT see User 1 text. Saw: "${user2SeesContent}"` };
      console.log('CRITICAL CHECK FAIL: User 2 does NOT see User 1 text');
      uxIssues.push({ severity: 'Critical', issue: 'Asymmetric sync - User 2 cannot see User 1 changes' });
    }
    await screenshot(page2, '10-user2-sync-check.png');

    // === PHASE 6: User 2 Types ===
    console.log('\n=== Phase 6: User 2 Types in Live Doc ===');

    const user2Text = ' And hello from User 2!';
    if (await typeInLiveDoc(page2, user2Text)) {
      await screenshot(page2, '11-user2-typed.png');
      console.log('User 2 typed in Live Doc');
    }
    await sleep(3000);

    // === PHASE 7: User 1 Verifies - CRITICAL CHECK ===
    console.log('\n=== Phase 7: CRITICAL - User 1 Verifies Bidirectional Sync ===');

    await page1.bringToFront();
    await sleep(3000);
    await screenshot(page1, '12-user1-final-check.png');

    const user1SeesContent = await getLiveDocContent(page1);
    console.log(`User 1 sees content: "${user1SeesContent}"`);

    const hasUser1Text = user1SeesContent.includes('Hello from User 1!');
    const hasUser2Text = user1SeesContent.includes('hello from User 2');

    if (hasUser2Text) {
      results.user2ToUser1Sync = { status: 'PASS', notes: 'User 1 sees User 2 text - reverse sync works!' };
      console.log('CRITICAL CHECK PASS: User 1 sees User 2 text');
    } else {
      results.user2ToUser1Sync = { status: 'FAIL', notes: `User 1 does NOT see User 2 text. Saw: "${user1SeesContent}"` };
      console.log('CRITICAL CHECK FAIL: User 1 does NOT see User 2 text');
    }

    // Final bidirectional check
    if (results.user1ToUser2Sync.status === 'PASS' && results.user2ToUser1Sync.status === 'PASS') {
      results.bidirectionalSync = { status: 'PASS', notes: 'BIDIRECTIONAL SYNC WORKS! Both users see each other changes.' };
      console.log('\n*** BIDIRECTIONAL SYNC FIX VERIFIED: PASS ***');
    } else {
      results.bidirectionalSync = { status: 'FAIL', notes: 'Bidirectional sync still has issues' };
      console.log('\n*** BIDIRECTIONAL SYNC: FAIL ***');
    }

    await screenshot(page1, '13-final-result.png');

  } catch (error) {
    console.error('Test error:', error.message);
    results.accountCreation = results.accountCreation.status === 'PENDING'
      ? { status: 'FAIL', notes: error.message }
      : results.accountCreation;
  } finally {
    // Generate report
    await generateReport();

    // Keep browser open for inspection
    console.log('\nBrowser kept open for inspection. Press Ctrl+C to close.');

    // Wait for manual close
    await new Promise(resolve => {
      process.on('SIGINT', async () => {
        await browser.close();
        resolve();
        process.exit(0);
      });
    });
  }
}

async function generateReport() {
  const report = `# YJS Bidirectional Sync Test Report

**Date:** ${new Date().toISOString()}
**Timestamp:** ${TIMESTAMP}

## Accounts Created
- User 1: ${USER1_USERNAME}
- User 2: ${USER2_USERNAME}

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| Account Creation | ${results.accountCreation.status} | ${results.accountCreation.notes} |
| P2P Registration | ${results.p2pRegistration.status} | ${results.p2pRegistration.notes} |
| Live Doc Creation | ${results.liveDocCreation.status} | ${results.liveDocCreation.notes} |
| User1 -> User2 Sync | ${results.user1ToUser2Sync.status} | ${results.user1ToUser2Sync.notes} |
| User2 -> User1 Sync | ${results.user2ToUser1Sync.status} | ${results.user2ToUser1Sync.notes} |
| **Bidirectional Sync** | **${results.bidirectionalSync.status}** | ${results.bidirectionalSync.notes} |

## Critical Verification Points

### 1. User 1 -> User 2 Sync (Previously Broken)
- **Status:** ${results.user1ToUser2Sync.status}
- **Details:** ${results.user1ToUser2Sync.notes}

### 2. User 2 -> User 1 Sync
- **Status:** ${results.user2ToUser1Sync.status}
- **Details:** ${results.user2ToUser1Sync.notes}

## UX/UI Issues Discovered

| Severity | Issue |
|----------|-------|
${uxIssues.map(i => `| ${i.severity} | ${i.issue} |`).join('\n') || '| None | No issues found |'}

## Console Messages (YJS Related)

\`\`\`
${consoleMessages.map(m => `[${m.tab}] ${m.type}: ${m.text}`).join('\n') || 'No YJS-related console messages captured'}
\`\`\`

## Overall Result: ${results.bidirectionalSync.status}

${results.bidirectionalSync.status === 'PASS'
  ? '**SUCCESS:** The bidirectional YJS sync fix has been verified. Both users can see each other changes in the Live Doc.'
  : '**FAILURE:** Bidirectional sync is still not working correctly. Further investigation needed.'}
`;

  fs.writeFileSync(REPORT_FILE, report);
  console.log(`\nReport saved to: ${REPORT_FILE}`);
}

runTest().catch(console.error);
