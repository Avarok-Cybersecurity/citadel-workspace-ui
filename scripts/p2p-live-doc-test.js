#!/usr/bin/env node

/**
 * P2P Live Document Bidirectional Sync Test
 *
 * Tests that Live Document collaboration works correctly between two users:
 * 1. Create two users in separate browser tabs
 * 2. P2P register them with each other
 * 3. Create a Live Doc from User 1's conversation
 * 4. Verify bidirectional text sync works
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = 'http://localhost:5173';
const WORKSPACE_SERVER = '127.0.0.1:12349';
const WORKSPACE_PASSWORD = 'dev-local-workspace-password';
const USER_PASSWORD = 'test12345';
const TIMESTAMP = Date.now();
const USER1_USERNAME = `synctest1_${TIMESTAMP}`;
const USER2_USERNAME = `synctest2_${TIMESTAMP}`;
const SCREENSHOT_DIR = path.join(__dirname, '../test-screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Test results collector
const testResults = {
  timestamp: new Date().toISOString(),
  user1: USER1_USERNAME,
  user2: USER2_USERNAME,
  steps: [],
  consoleErrors: [],
  uxIssues: [],
  passed: false,
};

function log(message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

function logStep(stepName, status, notes = '') {
  const step = { name: stepName, status, notes, timestamp: new Date().toISOString() };
  testResults.steps.push(step);
  log(`${status === 'PASS' ? 'SUCCESS' : status === 'FAIL' ? 'FAILURE' : 'INFO'}: ${stepName}${notes ? ' - ' + notes : ''}`);
}

function logUxIssue(severity, issue) {
  testResults.uxIssues.push({ severity, issue });
  log(`UX ISSUE [${severity}]: ${issue}`);
}

async function screenshot(page, name) {
  const filename = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filename, fullPage: true });
  log(`Screenshot saved: ${filename}`);
  return filename;
}

async function waitForSelector(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch (e) {
    return false;
  }
}

async function waitForText(page, text, timeout = 10000) {
  try {
    await page.waitForFunction(
      (text) => document.body.innerText.includes(text),
      { timeout },
      text
    );
    return true;
  } catch (e) {
    return false;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Type into an input by placeholder (using Puppeteer keyboard)
 */
async function typeIntoInputByPlaceholder(page, placeholderPattern, value) {
  const input = await page.evaluateHandle((pattern) => {
    const inputs = document.querySelectorAll('input');
    for (const inp of inputs) {
      const placeholder = inp.placeholder?.toLowerCase() || '';
      if (placeholder.includes(pattern.toLowerCase())) {
        return inp;
      }
    }
    return null;
  }, placeholderPattern);

  const element = input.asElement();
  if (element) {
    await element.click();
    await element.type(value, { delay: 20 });
    return true;
  }
  return false;
}

/**
 * Click a button by its title attribute (for icon buttons)
 */
async function clickButtonByTitle(page, title) {
  const clicked = await page.evaluate((title) => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.getAttribute('title')?.toLowerCase().includes(title.toLowerCase())) {
        btn.click();
        return true;
      }
    }
    return false;
  }, title);
  return clicked;
}

/**
 * Click on an element containing specific text
 */
async function clickElementByText(page, text, tagSelector = '*') {
  const clicked = await page.evaluate((text, tagSelector) => {
    const elements = document.querySelectorAll(tagSelector);
    for (const el of elements) {
      // Check if this element (not its children) contains the text
      const directText = el.textContent;
      if (directText?.includes(text)) {
        // Make sure it's clickable (button, link, or has click handler)
        if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.onclick || el.closest('button') || el.closest('a')) {
          (el.closest('button') || el.closest('a') || el).click();
          return true;
        }
        // Try clicking anyway
        el.click();
        return true;
      }
    }
    return false;
  }, text, tagSelector);
  return clicked;
}

// =====================================================
// MAIN TEST FUNCTION
// =====================================================

async function runTest() {
  log('Starting P2P Live Document Bidirectional Sync Test');
  log(`User1: ${USER1_USERNAME}`);
  log(`User2: ${USER2_USERNAME}`);

  const browser = await puppeteer.launch({
    headless: false,
    devtools: false,
    args: ['--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });

  let tab1, tab2;

  try {
    // =====================================================
    // PHASE 1: Create User 1 Account (Tab 1)
    // =====================================================

    log('--- PHASE 1: Create User 1 Account ---');

    tab1 = await browser.newPage();

    // Capture console errors
    tab1.on('console', (msg) => {
      if (msg.type() === 'error') {
        testResults.consoleErrors.push({ page: 'tab1', message: msg.text() });
      }
    });

    await tab1.goto(APP_URL);
    logStep('Navigate to app (Tab 1)', 'PASS');

    await sleep(2000);
    await screenshot(tab1, '01-landing-page');

    // Click "Join Workspace" button
    const joinClicked = await clickElementByText(tab1, 'Join Workspace', 'button');
    if (joinClicked) {
      logStep('Clicked Join Workspace button', 'PASS');
    }

    await sleep(1500);
    await screenshot(tab1, '02-join-workspace-modal');

    // Fill workspace location
    const locationFilled = await typeIntoInputByPlaceholder(tab1, 'avarok', WORKSPACE_SERVER);
    if (locationFilled) {
      logStep('Entered workspace location', 'PASS');
    }

    await sleep(500);

    // Click NEXT
    await clickElementByText(tab1, 'NEXT', 'button');
    logStep('Clicked NEXT (step 1)', 'PASS');

    await sleep(1500);
    await screenshot(tab1, '03-security-settings');

    // Click NEXT on security settings
    await clickElementByText(tab1, 'NEXT', 'button');
    logStep('Clicked NEXT (step 2 - security)', 'PASS');

    await sleep(1500);
    await screenshot(tab1, '04-user-profile-form');

    // Fill user profile
    await typeIntoInputByPlaceholder(tab1, 'john doe', 'P2P Test User One');
    logStep('Filled Full Name', 'PASS');

    await sleep(200);

    await typeIntoInputByPlaceholder(tab1, 'john.doe', USER1_USERNAME);
    logStep('Filled Username', 'PASS');

    await sleep(200);

    // Password inputs
    const passwordInputs = await tab1.$$('input[type="password"]');
    log(`Found ${passwordInputs.length} password inputs`);
    if (passwordInputs.length >= 2) {
      await passwordInputs[0].click();
      await passwordInputs[0].type(USER_PASSWORD, { delay: 20 });
      await sleep(100);
      await passwordInputs[1].click();
      await passwordInputs[1].type(USER_PASSWORD, { delay: 20 });
      logStep('Filled password fields', 'PASS');
    } else if (passwordInputs.length === 1) {
      await passwordInputs[0].click();
      await passwordInputs[0].type(USER_PASSWORD, { delay: 20 });
      await tab1.keyboard.press('Tab');
      await tab1.keyboard.type(USER_PASSWORD, { delay: 20 });
      logStep('Filled password fields (Tab method)', 'PASS');
    }

    await sleep(500);
    await screenshot(tab1, '05-user1-filled-form');

    // Click JOIN (exact match)
    const joinButtons = await tab1.$$('button');
    for (const btn of joinButtons) {
      const text = await btn.evaluate((el) => el.textContent?.trim());
      if (text === 'JOIN') {
        await btn.click();
        logStep('Clicked JOIN button', 'PASS');
        break;
      }
    }

    await sleep(3000);

    // Check for Initialize Workspace modal
    const initModalVisible = await waitForText(tab1, 'Initialize Workspace', 3000);
    if (initModalVisible) {
      log('Initialize Workspace modal appeared (first user)');
      await screenshot(tab1, '06-init-workspace-modal');

      const adminPasswordInput = await tab1.$('input[type="password"]');
      if (adminPasswordInput) {
        await adminPasswordInput.click();
        await adminPasswordInput.type(WORKSPACE_PASSWORD, { delay: 20 });
      }

      // Click INITIALIZE
      await clickElementByText(tab1, 'INITIALIZE', 'button');
      logStep('Initialized workspace', 'PASS');
      await sleep(3000);
    }

    // Wait for workspace to load
    const workspaceLoaded1 = await waitForText(tab1, 'WORKSPACE MEMBERS', 15000) ||
      await waitForText(tab1, 'DIRECT MESSAGES', 15000);

    if (workspaceLoaded1) {
      logStep('User 1 workspace loaded', 'PASS');
    } else {
      logStep('User 1 workspace loaded', 'FAIL', 'Workspace did not load in time');
      await screenshot(tab1, '07-user1-workspace-fail');
      throw new Error('User 1 workspace did not load');
    }

    await screenshot(tab1, '07-user1-workspace-loaded');

    // =====================================================
    // PHASE 2: Create User 2 Account (Tab 2)
    // =====================================================

    log('--- PHASE 2: Create User 2 Account ---');

    tab2 = await browser.newPage();

    tab2.on('console', (msg) => {
      if (msg.type() === 'error') {
        testResults.consoleErrors.push({ page: 'tab2', message: msg.text() });
      }
    });

    await tab2.goto(APP_URL);
    logStep('Navigate to app (Tab 2)', 'PASS');

    await sleep(2000);

    await clickElementByText(tab2, 'Join Workspace', 'button');
    await sleep(1500);

    await typeIntoInputByPlaceholder(tab2, 'avarok', WORKSPACE_SERVER);
    await sleep(500);

    await clickElementByText(tab2, 'NEXT', 'button');
    await sleep(1500);

    await clickElementByText(tab2, 'NEXT', 'button');
    await sleep(1500);

    await typeIntoInputByPlaceholder(tab2, 'john doe', 'P2P Test User Two');
    await sleep(200);
    await typeIntoInputByPlaceholder(tab2, 'john.doe', USER2_USERNAME);
    await sleep(200);

    const passwordInputs2 = await tab2.$$('input[type="password"]');
    if (passwordInputs2.length >= 2) {
      await passwordInputs2[0].click();
      await passwordInputs2[0].type(USER_PASSWORD, { delay: 20 });
      await sleep(100);
      await passwordInputs2[1].click();
      await passwordInputs2[1].type(USER_PASSWORD, { delay: 20 });
    }

    await screenshot(tab2, '08-user2-filled-form');

    // Click JOIN
    const joinButtons2 = await tab2.$$('button');
    for (const btn of joinButtons2) {
      const text = await btn.evaluate((el) => el.textContent?.trim());
      if (text === 'JOIN') {
        await btn.click();
        break;
      }
    }

    await sleep(3000);

    // Handle Initialize Workspace if it appears
    const initModalVisible2 = await waitForText(tab2, 'Initialize Workspace', 2000);
    if (initModalVisible2) {
      logUxIssue('MEDIUM', 'Initialize Workspace modal appeared for second user');
      const adminPasswordInput2 = await tab2.$('input[type="password"]');
      if (adminPasswordInput2) {
        await adminPasswordInput2.click();
        await adminPasswordInput2.type(WORKSPACE_PASSWORD, { delay: 20 });
      }
      await clickElementByText(tab2, 'INITIALIZE', 'button');
      await sleep(3000);
    }

    // Wait for workspace to load
    const workspaceLoaded2 = await waitForText(tab2, 'WORKSPACE MEMBERS', 15000) ||
      await waitForText(tab2, 'DIRECT MESSAGES', 15000);

    if (workspaceLoaded2) {
      logStep('User 2 workspace loaded', 'PASS');
    } else {
      logStep('User 2 workspace loaded', 'FAIL', 'Workspace did not load in time');
      await screenshot(tab2, '09-user2-workspace-fail');
      throw new Error('User 2 workspace did not load');
    }

    await screenshot(tab2, '09-user2-workspace-loaded');

    // =====================================================
    // PHASE 3: P2P Registration
    // =====================================================

    log('--- PHASE 3: P2P Registration ---');

    // Switch to Tab 1 (User 1)
    await tab1.bringToFront();
    await sleep(1000);

    // Click "Discover Peers" icon button (by title attribute)
    const discoverClicked = await clickButtonByTitle(tab1, 'Discover Peers');
    if (discoverClicked) {
      logStep('Click Discover Peers (User 1)', 'PASS');
    } else {
      // Fallback: Try to find button with UserPlus icon
      const iconButtonClicked = await tab1.evaluate(() => {
        // Find the WORKSPACE MEMBERS section and click the + icon next to it
        const headers = document.querySelectorAll('*');
        for (const h of headers) {
          if (h.textContent?.includes('WORKSPACE MEMBERS') && h.textContent.length < 50) {
            // Look for sibling button
            const parent = h.closest('div');
            const button = parent?.querySelector('button');
            if (button) {
              button.click();
              return true;
            }
          }
        }
        return false;
      });
      if (iconButtonClicked) {
        logStep('Click Discover Peers (User 1)', 'PASS', 'via icon search');
      } else {
        logStep('Click Discover Peers (User 1)', 'FAIL', 'Button not found');
        await screenshot(tab1, '10-discover-peers-not-found');
      }
    }

    await sleep(2000);
    await screenshot(tab1, '10-discover-peers-modal');

    // The modal should auto-discover on open, but click Refresh if needed
    await sleep(1000);

    // Look for Refresh button with icon
    await clickButtonByTitle(tab1, 'Refresh');
    await sleep(3000);

    // Wait for User 2 to appear in peer list
    const user2InList = await waitForText(tab1, USER2_USERNAME, 10000);
    if (user2InList) {
      logStep('User 2 appears in peer list', 'PASS');
    } else {
      logStep('User 2 appears in peer list', 'FAIL', 'User 2 not found in peer list');
      await screenshot(tab1, '11-user2-not-in-list');
    }

    await screenshot(tab1, '11-peer-list-with-user2');

    // Click Connect next to User 2
    // Find the row with User 2 and click Connect button
    const connectClicked = await tab1.evaluate((username) => {
      // Find the element containing the username
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent?.includes(username) && el.textContent.length < username.length + 100) {
          // Look for Connect button nearby
          const parent = el.closest('div');
          if (parent) {
            const buttons = parent.querySelectorAll('button');
            for (const btn of buttons) {
              if (btn.textContent?.toLowerCase().includes('connect')) {
                btn.click();
                return true;
              }
            }
          }
        }
      }
      // Fallback: just find any Connect button
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.toLowerCase().includes('connect') && !btn.disabled) {
          btn.click();
          return true;
        }
      }
      return false;
    }, USER2_USERNAME);

    if (connectClicked) {
      logStep('Sent P2P registration request to User 2', 'PASS');
    } else {
      logStep('Sent P2P registration request to User 2', 'FAIL', 'Connect button not found');
    }

    await sleep(2000);
    await screenshot(tab1, '12-user1-sent-invite');

    // Switch to Tab 2 (User 2) to accept the request
    await tab2.bringToFront();
    await sleep(2000);

    await screenshot(tab2, '13-user2-notification');

    // Click on notification bell to see pending requests
    const bellClicked = await tab2.evaluate(() => {
      // Look for notification bell button (usually has Bell icon or notification badge)
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        // Check for badge or bell class/content
        if (btn.querySelector('[class*="badge"]') ||
            btn.innerHTML.includes('Bell') ||
            btn.innerHTML.includes('bell') ||
            btn.getAttribute('aria-label')?.includes('notification')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    if (bellClicked) {
      log('Clicked notification bell');
    }

    await sleep(2000);
    await screenshot(tab2, '14-user2-pending-requests');

    // Find and click Accept for User 1's request
    const acceptClicked = await clickElementByText(tab2, 'Accept', 'button');
    if (acceptClicked) {
      logStep('User 2 accepted P2P registration', 'PASS');
    } else {
      logStep('User 2 accepted P2P registration', 'FAIL', 'Accept button not found');
    }

    await sleep(3000);

    // Verify DIRECT MESSAGES section shows User 1
    const user1InDM = await waitForText(tab2, USER1_USERNAME, 5000);
    if (user1InDM) {
      logStep('User 1 appears in Direct Messages (User 2)', 'PASS');
    } else {
      logStep('User 1 appears in Direct Messages (User 2)', 'FAIL', 'User 1 not in DM sidebar');
      await screenshot(tab2, '15-user1-not-in-dm');
    }

    await screenshot(tab2, '15-p2p-registration-complete');

    // =====================================================
    // PHASE 4: Open Chat and Create Live Document from User 1
    // =====================================================

    log('--- PHASE 4: Create Live Document ---');

    // Switch to Tab 1 (User 1)
    await tab1.bringToFront();
    await sleep(2000);

    // Close any modal by pressing Escape
    await tab1.keyboard.press('Escape');
    await sleep(500);

    // Wait for User 2 to appear in Direct Messages
    const user2InDM1 = await waitForText(tab1, USER2_USERNAME, 10000);
    if (!user2InDM1) {
      await tab1.reload();
      await sleep(3000);
    }

    await screenshot(tab1, '16-user1-dm-list');

    // Click on User 2 in Direct Messages to open chat
    const chatOpened = await tab1.evaluate((username) => {
      // Find DIRECT MESSAGES section
      const dmSection = Array.from(document.querySelectorAll('*')).find(el =>
        el.textContent?.includes('DIRECT MESSAGES') && el.textContent.length < 50
      );

      if (dmSection) {
        // Look for username in nearby elements
        const parent = dmSection.closest('div[class*="sidebar"]') || dmSection.parentElement?.parentElement;
        if (parent) {
          const links = parent.querySelectorAll('a, button, div[role="button"]');
          for (const link of links) {
            if (link.textContent?.includes(username)) {
              link.click();
              return true;
            }
          }
        }
      }

      // Fallback: look anywhere for username
      const elements = document.querySelectorAll('a, button, [role="button"], [class*="sidebar"] *');
      for (const el of elements) {
        if (el.textContent?.includes(username) && el.textContent.length < username.length + 50) {
          el.click();
          return true;
        }
      }
      return false;
    }, USER2_USERNAME);

    if (chatOpened) {
      logStep('Opened chat with User 2 (from User 1)', 'PASS');
    } else {
      logStep('Opened chat with User 2 (from User 1)', 'FAIL', 'Could not click on user');
    }

    await sleep(2000);
    await screenshot(tab1, '17-user1-chat-view');

    // Look for Live Document/Doc button in chat input area
    const docTypeSelected = await tab1.evaluate(() => {
      // Look for button with FileText icon or "Doc" text
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.innerHTML.includes('FileText') ||
            btn.innerHTML.includes('file-text') ||
            btn.textContent?.toLowerCase().includes('doc')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (docTypeSelected) {
      logStep('Selected Live Document message type', 'PASS');
    }

    await sleep(1000);
    await screenshot(tab1, '18-doc-type-selected');

    // Click create/send to open Live Document modal
    const submitBtn = await tab1.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    }

    await sleep(2000);
    await screenshot(tab1, '19-live-doc-modal');

    // Fill in document title
    const titleFilled = await typeIntoInputByPlaceholder(tab1, 'title', 'Test Live Document');
    if (!titleFilled) {
      await typeIntoInputByPlaceholder(tab1, 'name', 'Test Live Document');
    }
    logStep('Entered document title', 'PASS');

    await sleep(500);

    // Click Create button
    await clickElementByText(tab1, 'Create', 'button');
    logStep('Created Live Document', 'PASS');

    await sleep(3000);
    await screenshot(tab1, '20-live-doc-created');

    // =====================================================
    // PHASE 5: User 1 Types in Live Doc
    // =====================================================

    log('--- PHASE 5: User 1 Types in Live Document ---');

    // Find the editor
    let editor1 = await tab1.$('.ProseMirror');
    if (!editor1) {
      editor1 = await tab1.$('[contenteditable="true"]');
    }
    if (!editor1) {
      editor1 = await tab1.$('.tiptap');
    }

    if (editor1) {
      await editor1.click();
      await tab1.keyboard.type('Hello from User 1!', { delay: 30 });
      logStep('User 1 typed in Live Document', 'PASS');
    } else {
      logStep('User 1 typed in Live Document', 'FAIL', 'Editor not found');
      await screenshot(tab1, '21-editor-not-found');
    }

    await sleep(2000);
    await screenshot(tab1, '21-user1-typed');

    // =====================================================
    // PHASE 6: User 2 Opens the Same Live Doc
    // =====================================================

    log('--- PHASE 6: User 2 Opens Live Document ---');

    await tab2.bringToFront();
    await sleep(2000);

    // Click on User 1 in Direct Messages
    await tab2.evaluate((username) => {
      const elements = document.querySelectorAll('a, button, [role="button"], div');
      for (const el of elements) {
        if (el.textContent?.includes(username) && el.textContent.length < username.length + 50) {
          el.click();
          return true;
        }
      }
      return false;
    }, USER1_USERNAME);
    logStep('Opened chat with User 1 (from User 2)', 'PASS');

    await sleep(2000);
    await screenshot(tab2, '22-user2-chat-view');

    // Look for the Live Document message and click Open
    const docOpened = await tab2.evaluate(() => {
      // Look for Live Document message bubble
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const text = el.textContent?.toLowerCase() || '';
        if (text.includes('test live document') || (text.includes('live') && text.includes('document'))) {
          // Try to find and click Open button
          const buttons = el.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.textContent?.toLowerCase().includes('open')) {
              btn.click();
              return true;
            }
          }
          // Try clicking the element itself
          if (el.tagName === 'BUTTON' || el.onclick) {
            el.click();
            return true;
          }
        }
      }
      return false;
    });

    if (docOpened) {
      logStep('User 2 opened Live Document', 'PASS');
    } else {
      logStep('User 2 opened Live Document', 'FAIL', 'Could not find document');
    }

    await sleep(3000);
    await screenshot(tab2, '23-user2-live-doc-opened');

    // =====================================================
    // PHASE 7: Verify User 2 Sees User 1's Text
    // =====================================================

    log('--- PHASE 7: Verify Bidirectional Sync (User 2 sees User 1 text) ---');

    const user2SeesUser1Text = await waitForText(tab2, 'Hello from User 1!', 10000);

    if (user2SeesUser1Text) {
      logStep('User 2 sees User 1 text', 'PASS', 'Bidirectional sync working!');
    } else {
      logStep('User 2 sees User 1 text', 'FAIL', 'Text not visible - sync may be broken');
      await screenshot(tab2, '24-sync-fail-user2');
    }

    await screenshot(tab2, '24-user2-sees-user1-text');

    // =====================================================
    // PHASE 8: User 2 Types in Live Doc
    // =====================================================

    log('--- PHASE 8: User 2 Types in Live Document ---');

    let editor2 = await tab2.$('.ProseMirror');
    if (!editor2) {
      editor2 = await tab2.$('[contenteditable="true"]');
    }
    if (!editor2) {
      editor2 = await tab2.$('.tiptap');
    }

    if (editor2) {
      await editor2.click();
      await tab2.keyboard.press('End');
      await tab2.keyboard.type(' And hello from User 2!', { delay: 30 });
      logStep('User 2 typed in Live Document', 'PASS');
    } else {
      logStep('User 2 typed in Live Document', 'FAIL', 'Editor not found');
    }

    await sleep(2000);
    await screenshot(tab2, '25-user2-typed');

    // =====================================================
    // PHASE 9: Verify User 1 Sees Both Texts
    // =====================================================

    log('--- PHASE 9: Verify User 1 Sees Both Texts ---');

    await tab1.bringToFront();
    await sleep(3000);

    const user1SeesBoth = await waitForText(tab1, 'And hello from User 2!', 10000);

    if (user1SeesBoth) {
      logStep('User 1 sees User 2 text', 'PASS', 'Full bidirectional sync confirmed!');
    } else {
      logStep('User 1 sees User 2 text', 'FAIL', 'User 2 text not visible to User 1');
      await screenshot(tab1, '26-sync-fail-user1');
    }

    await screenshot(tab1, '26-final-sync-verified');

    // Final verification
    try {
      const editorSelector = '.ProseMirror, [contenteditable="true"], .tiptap';
      const fullText = await tab1.$eval(editorSelector, (el) => el.innerText);
      log(`Final document content (User 1 view): "${fullText}"`);

      if (fullText.includes('Hello from User 1!') && fullText.includes('And hello from User 2!')) {
        logStep('Full bidirectional sync', 'PASS', 'Both users see all content');
        testResults.passed = true;
      } else {
        logStep('Full bidirectional sync', 'FAIL', 'Content mismatch');
      }
    } catch (e) {
      logStep('Full bidirectional sync', 'FAIL', `Could not read editor: ${e.message}`);
    }

    await screenshot(tab1, '27-test-complete');

  } catch (error) {
    log(`TEST ERROR: ${error.message}`);
    testResults.steps.push({
      name: 'Test execution',
      status: 'ERROR',
      notes: error.message,
      timestamp: new Date().toISOString(),
    });

    if (tab1) await screenshot(tab1, 'error-tab1');
    if (tab2) await screenshot(tab2, 'error-tab2');

  } finally {
    log('--- Generating Test Report ---');

    const reportPath = path.join(__dirname, '../LIVE_DOC_SYNC_TEST_REPORT.md');
    const reportContent = `# P2P Live Document Bidirectional Sync Test Report

**Date:** ${testResults.timestamp}
**Test ID:** ${TIMESTAMP}

## Accounts Created
- User 1: ${testResults.user1}
- User 2: ${testResults.user2}

## Test Results

| Step | Status | Notes |
|------|--------|-------|
${testResults.steps.map((s) => `| ${s.name} | ${s.status} | ${s.notes || '-'} |`).join('\n')}

## UX/UI Issues Discovered

${
  testResults.uxIssues.length > 0
    ? testResults.uxIssues.map((i) => `- **[${i.severity}]** ${i.issue}`).join('\n')
    : 'No UX issues discovered.'
}

## Console Errors

${
  testResults.consoleErrors.length > 0
    ? testResults.consoleErrors.map((e) => `- [${e.page}] ${e.message}`).join('\n')
    : 'No console errors captured.'
}

## Overall Result: ${testResults.passed ? 'PASS' : 'FAIL'}

## Screenshots

Screenshots saved to: \`test-screenshots/\`
`;

    fs.writeFileSync(reportPath, reportContent);
    log(`Report saved to: ${reportPath}`);

    await browser.close();
    log('Test complete. Browser closed.');

    process.exit(testResults.passed ? 0 : 1);
  }
}

runTest().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
