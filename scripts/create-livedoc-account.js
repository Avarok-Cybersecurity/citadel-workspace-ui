#!/usr/bin/env node

/**
 * Create Live Doc Test Account
 *
 * Creates a single account for Live Doc testing with username format:
 * livedoc_user1_{timestamp}
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = 'http://localhost:5173';
const WORKSPACE_LOCATION = '127.0.0.1:12349';
const WORKSPACE_PASSWORD = 'dev-local-workspace-password';
const USER_PASSWORD = 'test12345';
const TIMESTAMP = Date.now();
const USERNAME = `livedoc_user1_${TIMESTAMP}`;
const FULL_NAME = 'Live Doc User 1';

const SCREENSHOT_DIR = path.join(__dirname, '../test-screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot saved: ${name}`);
  return filepath;
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

async function createAccount(page) {
  console.log(`\n=== Creating account: ${USERNAME} ===\n`);

  // Navigate to app
  await page.goto(APP_URL);
  await sleep(2000);
  await screenshot(page, `livedoc_01_landing.png`);

  // Click Join Workspace
  console.log('Clicking "Join Workspace"...');
  if (!(await clickByText(page, 'Join Workspace', 'button'))) {
    throw new Error('Cannot find Join Workspace button');
  }
  await sleep(1000);
  await screenshot(page, `livedoc_02_join_form.png`);

  // Fill workspace location
  console.log('Filling workspace location...');
  await typeInInput(page, 'Enter workspace', WORKSPACE_LOCATION);
  await sleep(500);

  // Click NEXT
  console.log('Clicking "NEXT" on workspace form...');
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
  await screenshot(page, `livedoc_03_security_modal.png`);

  // Click NEXT on security settings
  console.log('Clicking "NEXT" on security modal...');
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
  await screenshot(page, `livedoc_04_user_details_form.png`);

  // Fill user profile
  console.log('Filling user details...');
  await typeInInput(page, 'Full Name', FULL_NAME);
  await typeInInput(page, 'Username', USERNAME);
  await typeInInput(page, 'Password', USER_PASSWORD);
  // Look for confirm password
  const confirmInputs = await page.$$('input[type="password"]');
  if (confirmInputs.length > 1) {
    await confirmInputs[1].click();
    await confirmInputs[1].type(USER_PASSWORD);
  }
  await sleep(500);
  await screenshot(page, `livedoc_05_user_details_filled.png`);

  // Click JOIN
  console.log('Clicking "JOIN" button...');
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
  await screenshot(page, `livedoc_06_after_register.png`);

  // Handle Initialize Workspace modal
  console.log('Checking for Initialize Workspace modal...');
  const modalCheck = await page.evaluate(() => {
    return document.body.innerText.includes('Initialize Workspace');
  });

  if (modalCheck) {
    console.log('Initialize Workspace modal detected - entering password...');
    await sleep(500);
    await screenshot(page, `livedoc_07_init_modal.png`);

    const passwordInputs = await page.$$('input[type="password"]');
    if (passwordInputs.length > 0) {
      await passwordInputs[0].click();
      await passwordInputs[0].type(WORKSPACE_PASSWORD);
    }

    // Click submit button
    const submitBtns = await page.$$('button');
    for (const btn of submitBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && (text.includes('INITIALIZE') || text.includes('Initialize') || text.includes('Submit'))) {
        await btn.click();
        break;
      }
    }
    await sleep(2000);
    await screenshot(page, `livedoc_08_after_init.png`);
  } else {
    console.log('Not first user - skipping workspace initialization');
  }

  // Wait for workspace to load
  console.log('Waiting for workspace to load...');
  await sleep(3000);
  await screenshot(page, `livedoc_09_dashboard.png`);

  return true;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 }
  });

  try {
    const page = await browser.newPage();

    // Set up console error monitoring
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error(`Console error: ${msg.text()}`);
      }
    });

    // Create account
    const success = await createAccount(page);

    if (success) {
      console.log('\n✅ SUCCESS');
      console.log(`\nAccount created:`);
      console.log(`  Username: ${USERNAME}`);
      console.log(`  Password: ${USER_PASSWORD}`);
      console.log(`  Full Name: ${FULL_NAME}`);
      console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);

      if (consoleErrors.length > 0) {
        console.log(`\n⚠️  Console errors detected (${consoleErrors.length}):`);
        consoleErrors.forEach((err, i) => {
          console.log(`  ${i + 1}. ${err}`);
        });
      } else {
        console.log(`\n✅ No console errors detected`);
      }
    } else {
      console.error('\n❌ FAILED to create account');
    }

    // Keep browser open for manual inspection
    console.log('\nBrowser will remain open for inspection. Press Ctrl+C to close.');
    await new Promise(() => {}); // Keep alive

  } catch (error) {
    console.error('Error during execution:', error);
    await browser.close();
    process.exit(1);
  }
}

main();
