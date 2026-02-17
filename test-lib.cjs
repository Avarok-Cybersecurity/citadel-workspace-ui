/**
 * Citadel Workspace Test Library
 *
 * Shared utilities for Playwright-based integration tests.
 * Provides DRY functions for common testing operations.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');

// ============================================================================
// Configuration
// ============================================================================

const config = {
  BASE_URL: 'http://localhost:5173',
  INTERNAL_SERVICE_URL: 'http://localhost:12345',
  WORKSPACE_SERVER: 'localhost:12349',
  WORKSPACE_PASSWORD: 'dev-local-workspace-password',
  DEFAULT_PASSWORD: 'test12345',
  SCREENSHOTS_DIR: 'screenshots',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a unique test ID based on timestamp
 * @param {string} prefix - Prefix for the ID
 */
function generateTestId(prefix = 'test') {
  return `${prefix}_${Date.now()}`;
}

/**
 * Check if a TCP port is open (works for HTTP and WebSocket services)
 * @param {string} host - Hostname
 * @param {number} port - Port number
 * @param {number} timeout - Timeout in ms
 */
async function isTcpPortOpen(host, port, timeout = 3000) {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Check if a service is alive (supports both HTTP and WebSocket services)
 * @param {string} url - URL to check
 * @param {number} timeout - Timeout in ms
 */
async function isServiceAlive(url, timeout = 5000) {
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
  return isTcpPortOpen(host, port, timeout);
}

/**
 * Wait for backend services to be alive
 * @param {number} timeout - Maximum wait time in ms (default: 3 minutes)
 * @param {number} pollInterval - How often to check in ms (default: 2 seconds)
 */
async function waitForServicesAlive(timeout = 180000, pollInterval = 2000) {
  console.log('\n=== Waiting for services to be alive ===');
  const startTime = Date.now();

  // Only check UI since internal service is inside Docker and connects via the UI's WebSocket
  const services = [
    { name: 'UI', url: config.BASE_URL },
  ];

  while (Date.now() - startTime < timeout) {
    const results = await Promise.all(
      services.map(async (svc) => ({
        name: svc.name,
        alive: await isServiceAlive(svc.url, 3000),
      }))
    );

    const allAlive = results.every(r => r.alive);

    if (allAlive) {
      console.log('  All services are alive:');
      results.forEach(r => console.log(`    ${r.name}: OK`));
      // Give backend services a moment to fully initialize
      console.log('  Waiting 3s for backend initialization...');
      await sleep(3000);
      return true;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  Waiting... (${elapsed}s elapsed)`);
    results.forEach(r => {
      console.log(`    ${r.name}: ${r.alive ? 'OK' : 'waiting...'}`);
    });

    await sleep(pollInterval);
  }

  throw new Error(`Services did not become alive within ${timeout / 1000}s`);
}

// ============================================================================
// UX Issue Tracking
// ============================================================================

class UxIssueTracker {
  constructor() {
    this.issues = [];
  }

  /**
   * Log a UX issue
   * @param {'critical'|'major'|'minor'|'suggestion'} severity
   * @param {'visual'|'functional'|'performance'|'accessibility'} category
   * @param {string} description
   * @param {string|null} screenshot
   */
  log(severity, category, description, screenshot = null) {
    const issue = {
      severity,
      category,
      description,
      screenshot,
      timestamp: new Date().toISOString(),
    };
    this.issues.push(issue);
    console.log(`  [UX ${severity.toUpperCase()}/${category}]: ${description}`);
  }

  getIssues() {
    return this.issues;
  }

  clear() {
    this.issues = [];
  }
}

// ============================================================================
// Screenshot Utilities
// ============================================================================

/**
 * Ensure screenshots directory exists
 * @param {boolean} clean - If true, remove existing screenshots
 */
function ensureScreenshotsDir(clean = false) {
  if (clean && fs.existsSync(config.SCREENSHOTS_DIR)) {
    fs.rmSync(config.SCREENSHOTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(config.SCREENSHOTS_DIR)) {
    fs.mkdirSync(config.SCREENSHOTS_DIR, { recursive: true });
  }
}

/**
 * Take a screenshot
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} name - Screenshot name (without extension)
 * @param {boolean} fullPage - Whether to capture full page
 */
async function takeScreenshot(page, name, fullPage = true) {
  try {
    const path = `${config.SCREENSHOTS_DIR}/${name}.png`;
    await page.screenshot({ path, fullPage, timeout: 10000 });
    console.log(`  Screenshot: ${name}.png`);
    return path;
  } catch (e) {
    console.log(`  Screenshot failed: ${name} (${e.message})`);
    return null;
  }
}

// ============================================================================
// Modal & Dialog Utilities
// ============================================================================

/**
 * Close any open modals by pressing Escape
 * @param {import('playwright').Page} page - Playwright page
 * @param {number} maxAttempts - Maximum number of escape presses
 */
async function closeAnyModals(page, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const backdrop = page.locator('.bg-black\\/60, [data-state="open"]').first();
    if (await backdrop.isVisible({ timeout: 300 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await sleep(300);
    } else {
      break;
    }
  }
}

/**
 * Check for error toasts or messages on the page
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} context - Context description for logging
 * @param {UxIssueTracker} uxTracker - Optional UX issue tracker
 */
async function checkForErrors(page, context, uxTracker = null) {
  const errorToast = page.locator('[role="alert"]:has-text("error"), [role="alert"]:has-text("failed")').first();
  if (await errorToast.isVisible({ timeout: 500 }).catch(() => false)) {
    const errorText = await errorToast.textContent();
    if (uxTracker) {
      uxTracker.log('critical', 'functional', `Error in ${context}: ${errorText}`);
    }
    console.log(`  ERROR in ${context}: ${errorText}`);
    return true;
  }
  return false;
}

// ============================================================================
// Workspace Loading Utilities
// ============================================================================

/**
 * Wait for workspace to fully load
 * @param {import('playwright').Page} page - Playwright page
 * @param {number} timeout - Maximum wait time in ms
 */
async function waitForWorkspaceLoaded(page, timeout = 60000) {
  console.log('  Waiting for workspace to fully load...');
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const loadingIndicator = page.locator('text="Loading workspace..."');
    const isLoading = await loadingIndicator.isVisible({ timeout: 500 }).catch(() => false);

    if (!isLoading) {
      const sidebar = page.locator('text="WORKSPACE MEMBERS"').first();
      if (await sidebar.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('  Workspace fully loaded');
        return true;
      }
    }

    await sleep(1000);
  }

  console.log('  Workspace loading timeout');
  return false;
}

// ============================================================================
// Account Management
// ============================================================================

/**
 * Create a new user account
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} username - Username to create
 * @param {object} options - Options
 * @param {boolean} options.isFirstUser - Whether this is the first user (initializes workspace)
 * @param {string} options.password - Password to use
 * @param {UxIssueTracker} options.uxTracker - Optional UX issue tracker
 */
async function createAccount(page, username, options = {}) {
  const {
    isFirstUser = false,
    password = config.DEFAULT_PASSWORD,
    uxTracker = null,
  } = options;

  console.log(`\n=== Creating account: ${username} ===`);

  await page.goto(config.BASE_URL);
  await sleep(2000);

  // Click "Join Workspace" button
  const joinBtn = page.locator('button:has-text("Join Workspace")');
  if (await joinBtn.isVisible()) {
    await joinBtn.click();
    await sleep(1000);
  }

  // Step 1: Fill workspace location
  const serverInput = page.locator('#serverAddress');
  await serverInput.fill(config.WORKSPACE_SERVER);
  await sleep(500);

  // Click NEXT to go to Security Settings
  let nextBtn = page.locator('button:has-text("NEXT")');
  await nextBtn.click();
  await sleep(2000);

  // Step 2: Security Settings - just click NEXT
  const securityTitle = page.locator('text="Security Settings"');
  if (await securityTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
    nextBtn = page.locator('button:has-text("NEXT")');
    await nextBtn.click();
    await sleep(2000);
  }

  // Step 3: User Details form
  const fullNameInput = page.locator('input#fullName');
  if (await fullNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fullNameInput.fill(username);
    await sleep(300);

    const usernameInput = page.locator('input#username');
    if (await usernameInput.isVisible()) {
      await usernameInput.fill(username);
      await sleep(300);
    }

    const passwordInput = page.locator('input#password');
    const confirmPasswordInput = page.locator('input#confirmPassword');

    if (await passwordInput.isVisible()) {
      await passwordInput.fill(password);
      await sleep(300);
    }
    if (await confirmPasswordInput.isVisible()) {
      await confirmPasswordInput.fill(password);
      await sleep(300);
    }

    const submitBtn = page.locator('button:has-text("Register"), button:has-text("Create Account"), button[type="submit"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await sleep(8000);
    }
  }

  // Handle Initialize Workspace modal (only for first user)
  if (isFirstUser) {
    const passwordField = page.locator('input#masterPassword');
    if (await passwordField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordField.fill(config.WORKSPACE_PASSWORD);
      await sleep(500);

      const initBtn = page.locator('button:has-text("Initialize Workspace")');
      if (await initBtn.isVisible()) {
        await initBtn.click();
        await sleep(5000);
      }
    }
  }

  await closeAnyModals(page);
  await checkForErrors(page, 'account creation', uxTracker);

  // Wait for workspace to load
  const loaded = await waitForWorkspaceLoaded(page, 45000);
  if (!loaded) {
    console.log('  WARNING: Workspace may not have fully loaded');
  }

  await takeScreenshot(page, `${username}_created`);
  console.log(`  Account ${username} created`);
  return true;
}

// ============================================================================
// P2P Operations
// ============================================================================

/**
 * Register a P2P connection with a peer
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} myUsername - My username (for logging/screenshots)
 * @param {string} peerUsername - Username of peer to register with
 * @param {UxIssueTracker} uxTracker - Optional UX issue tracker
 */
async function p2pRegister(page, myUsername, peerUsername, uxTracker = null) {
  console.log(`\n=== P2P Register: ${myUsername} -> ${peerUsername} ===`);

  const loaded = await waitForWorkspaceLoaded(page, 45000);
  if (!loaded) {
    if (uxTracker) {
      uxTracker.log('critical', 'functional', 'Workspace failed to load for P2P registration');
    }
    await takeScreenshot(page, `${myUsername}_workspace_not_loaded`);
    return false;
  }

  // Wait longer for session to be fully established in Citadel SDK
  console.log('  Waiting for session to be fully established...');
  await sleep(5000);

  // Try to open Peer Discovery modal
  let modalOpened = false;

  // Method 1: Click the UserPlus button directly
  const userPlusBtn = page.locator('button:has(svg.lucide-user-plus), button[title="Discover Peers"]').first();
  if (await userPlusBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Found Discover Peers button, clicking...');
    await userPlusBtn.click();
    await sleep(2000);
    modalOpened = true;
  }

  // Method 2: Hover over WORKSPACE MEMBERS section first
  if (!modalOpened) {
    const membersSection = page.locator('text="WORKSPACE MEMBERS"').first();
    if (await membersSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  Hovering over WORKSPACE MEMBERS...');
      await membersSection.hover();
      await sleep(1000);

      const discoverBtn = page.locator('button[title="Discover Peers"], button:has(svg.lucide-user-plus)').first();
      if (await discoverBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await discoverBtn.click();
        await sleep(2000);
        modalOpened = true;
      }
    }
  }

  // Method 3: Force click
  if (!modalOpened) {
    console.log('  Attempting force click on Discover Peers...');
    await page.locator('button[title="Discover Peers"]').click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(2000);
  }

  await takeScreenshot(page, `${myUsername}_peer_discovery`);

  // Wait for peer list modal
  const modalTitle = page.locator('text="Peer Discovery"');
  if (!await modalTitle.isVisible({ timeout: 8000 }).catch(() => false)) {
    const altModal = page.locator('[role="dialog"]:has-text("Peer"), [role="dialog"]:has-text("Discovery")');
    if (!await altModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (uxTracker) {
        uxTracker.log('critical', 'functional', 'Peer Discovery modal did not open');
      }
      await takeScreenshot(page, `${myUsername}_modal_not_opened`);
      return false;
    }
  }

  console.log('  Peer Discovery modal opened');

  // Retry mechanism for peer discovery (API can timeout initially)
  const MAX_RETRIES = 3;
  let peerFound = false;

  for (let retry = 0; retry < MAX_RETRIES && !peerFound; retry++) {
    if (retry > 0) {
      console.log(`  Retry ${retry}/${MAX_RETRIES - 1}: Refreshing peer list...`);
      // Click refresh button if available
      const refreshBtn = page.locator('[role="dialog"] button:has(svg.lucide-refresh-cw)');
      if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await refreshBtn.click();
        await sleep(1000);
      }
    }

    // Wait for loading to complete (spinner to disappear)
    console.log('  Waiting for peer list to load...');
    for (let i = 0; i < 15; i++) {
      // Check if loading spinner is gone - look for Loader2 with animate-spin
      const loadingSpinner = page.locator('[role="dialog"] svg.lucide-loader-2.animate-spin, [role="dialog"] .animate-spin');
      const isLoading = await loadingSpinner.isVisible({ timeout: 500 }).catch(() => false);

      if (!isLoading) {
        console.log('  Peer list loaded');
        break;
      }

      if (i === 14) {
        console.log('  WARNING: Peer list loading timed out (will retry)');
      }
      await sleep(1000);
    }

    await sleep(1000); // Extra wait for UI to settle

    // Method 1: Find Connect button in the dialog and check if peer name is nearby
    const dialog = page.locator('[role="dialog"]');
    const connectButtons = dialog.locator('button:has-text("Connect")');
    const connectCount = await connectButtons.count();
    console.log(`  Found ${connectCount} Connect buttons in dialog`);

    for (let i = 0; i < connectCount && !peerFound; i++) {
      const connectBtn = connectButtons.nth(i);
      // Get the parent container and check if it contains the peer username
      const parent = connectBtn.locator('..').locator('..');
      const parentText = await parent.textContent().catch(() => '');
      console.log(`  Button ${i} parent text: "${parentText.substring(0, 50)}..."`);

      if (parentText.toLowerCase().includes(peerUsername.toLowerCase())) {
        peerFound = true;
        console.log(`  Found peer ${peerUsername}, clicking Connect...`);
        await connectBtn.click();
        await sleep(3000);
        console.log(`  P2P registration request sent`);
        break;
      }
    }

    // Method 2: Look for any text containing the peer username and find nearby Connect button
    if (!peerFound) {
      const peerText = dialog.locator(`text="${peerUsername}"`).first();
      if (await peerText.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`  Found peer text, looking for Connect button nearby...`);
        // Find parent container with Connect button
        const container = peerText.locator('xpath=ancestor::div[.//button[contains(text(), "Connect")]]').first();
        const connectBtn = container.locator('button:has-text("Connect")');
        if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          peerFound = true;
          console.log(`  Found peer ${peerUsername}, clicking Connect...`);
          await connectBtn.click();
          await sleep(3000);
          console.log(`  P2P registration request sent`);
        }
      }
    }

    if (!peerFound && retry < MAX_RETRIES - 1) {
      const visiblePeers = await page.locator('[role="dialog"] div.rounded-lg p.font-medium').allTextContents().catch(() => []);
      console.log(`  Peer not found yet. Available: ${visiblePeers.join(', ') || 'none'}. Retrying...`);
    }
  } // End of retry loop

  console.log(`  DEBUG: After retry loop, peerFound = ${peerFound}`);

  if (!peerFound) {
    const visiblePeers = await page.locator('[role="dialog"] div.rounded-lg p.font-medium').allTextContents().catch(() => []);
    console.log(`  Available peers: ${visiblePeers.join(', ') || 'none'}`);
    if (uxTracker) {
      uxTracker.log('major', 'functional', `Peer ${peerUsername} not found after ${MAX_RETRIES} retries. Available: ${visiblePeers.join(', ')}`);
    }
    await takeScreenshot(page, `${myUsername}_peer_not_found`);
  } else {
    console.log(`  SUCCESS: Peer ${peerUsername} found and Connect clicked`);
  }

  await page.keyboard.press('Escape');
  await sleep(500);
  return peerFound;
}

/**
 * Accept a pending P2P request
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} username - My username (for logging/screenshots)
 * @param {UxIssueTracker} uxTracker - Optional UX issue tracker
 */
async function acceptP2PRequest(page, username, uxTracker = null) {
  console.log(`\n=== ${username}: Checking for P2P requests ===`);

  await waitForWorkspaceLoaded(page, 30000);
  await sleep(2000);

  // Look for pending request badge
  const membersSection = page.locator('text="WORKSPACE MEMBERS"').locator('..');
  let badge = membersSection.locator('button.rounded-full').first();

  if (!await badge.isVisible({ timeout: 2000 }).catch(() => false)) {
    badge = page.locator('.bg-red-500').first();
  }

  if (await badge.isVisible({ timeout: 8000 }).catch(() => false)) {
    console.log('  Found pending request badge');
    await badge.click();
    await sleep(2000);

    await takeScreenshot(page, `${username}_pending_requests`);

    const acceptBtn = page.locator('button:has-text("Accept")');
    if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await acceptBtn.click();
      await sleep(3000);
      console.log(`  P2P request accepted`);

      await page.keyboard.press('Escape');
      await sleep(500);
      return true;
    } else {
      if (uxTracker) {
        uxTracker.log('major', 'functional', 'Accept button not found in pending requests modal');
      }
    }
  } else {
    console.log(`  No pending P2P request badge found`);
  }

  await closeAnyModals(page);
  return false;
}

/**
 * Open a conversation with a peer
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} username - My username (for logging/screenshots)
 * @param {string} peerUsername - Username of peer to chat with
 * @param {UxIssueTracker} uxTracker - Optional UX issue tracker
 */
async function openConversation(page, username, peerUsername, uxTracker = null) {
  console.log(`\n=== ${username}: Opening conversation with ${peerUsername} ===`);

  await waitForWorkspaceLoaded(page, 30000);
  await closeAnyModals(page);
  await sleep(1000);

  // Wait for peer to appear in sidebar
  for (let attempt = 0; attempt < 15; attempt++) {
    // Look in DIRECT MESSAGES section
    const dmSection = page.locator('text="DIRECT MESSAGES"').locator('..').locator('..');
    const peerInDM = dmSection.locator(`text="${peerUsername}"`).first();

    if (await peerInDM.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`  Found ${peerUsername} in DIRECT MESSAGES`);
      await peerInDM.click();
      await sleep(2000);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    // Also check WORKSPACE MEMBERS section
    const wsSection = page.locator('text="WORKSPACE MEMBERS"').locator('..').locator('..');
    const peerInWS = wsSection.locator(`text="${peerUsername}"`).first();

    if (await peerInWS.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`  Found ${peerUsername} in WORKSPACE MEMBERS`);
      await peerInWS.click();
      await sleep(2000);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    // Try button match
    const peerBtn = page.locator(`button:has-text("${peerUsername}")`).first();
    if (await peerBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`  Found ${peerUsername} via button`);
      await peerBtn.click();
      await sleep(2000);
      await takeScreenshot(page, `${username}_conversation_opened`);
      return true;
    }

    console.log(`  Waiting for peer in sidebar... (${attempt + 1}/15)`);
    await sleep(2000);
  }

  if (uxTracker) {
    uxTracker.log('critical', 'functional', `Could not find ${peerUsername} in sidebar after 15 attempts`);
  }
  await takeScreenshot(page, `${username}_peer_not_in_sidebar`);
  return false;
}

// ============================================================================
// Messaging Operations
// ============================================================================

/**
 * Send a message in the current chat
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} username - My username (for logging)
 * @param {string} messageText - Message to send
 * @param {UxIssueTracker} uxTracker - Optional UX issue tracker
 */
async function sendMessage(page, username, messageText, uxTracker = null) {
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
  await sleep(300);

  const sendBtn = page.locator('button[type="submit"]').last();
  if (await sendBtn.isVisible()) {
    await sendBtn.click();
  } else {
    await messageInput.press('Enter');
  }

  await sleep(1500);
  console.log(`  Message sent: "${messageText}"`);
  await takeScreenshot(page, `${username}_message_sent`);
  return true;
}

/**
 * Verify a message was received in the chat
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} username - My username (for logging)
 * @param {string} expectedText - Text to look for
 * @param {number} timeout - Maximum wait time in ms
 * @param {UxIssueTracker} uxTracker - Optional UX issue tracker
 */
async function verifyMessageReceived(page, username, expectedText, timeout = 10000, uxTracker = null) {
  console.log(`\n=== ${username}: Verifying message received ===`);

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const messageElement = page.locator(`.prose:has-text("${expectedText}"), p:has-text("${expectedText}")`).first();

    if (await messageElement.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`  Message found: "${expectedText}"`);
      return true;
    }

    const chatArea = page.locator('[class*="ScrollArea"], [class*="scroll"]').first();
    if (await chatArea.isVisible({ timeout: 500 }).catch(() => false)) {
      const content = await chatArea.textContent().catch(() => '');
      if (content.includes(expectedText)) {
        console.log(`  Message found in chat area: "${expectedText}"`);
        return true;
      }
    }

    await sleep(500);
  }

  if (uxTracker) {
    uxTracker.log('critical', 'functional', `Message not received within ${timeout}ms: "${expectedText}"`);
  }
  await takeScreenshot(page, `${username}_message_not_received`);
  return false;
}

// ============================================================================
// Browser Setup
// ============================================================================

/**
 * Create a browser and context for testing
 * @param {object} options - Browser options
 * @param {boolean} options.headless - Run in headless mode
 * @param {number} options.slowMo - Slow down actions by ms
 */
async function createBrowser(options = {}) {
  const { headless = false, slowMo = 50 } = options;

  const browser = await chromium.launch({ headless, slowMo });
  const context = await browser.newContext();

  return { browser, context };
}

/**
 * Setup console log capture for a page
 * @param {import('playwright').Page} page - Playwright page
 * @param {string} label - Label for log output
 * @param {string[]} filterKeywords - Keywords to filter logs (empty = log all)
 */
function setupConsoleCapture(page, label, filterKeywords = []) {
  const logs = [];

  page.on('console', msg => {
    const text = msg.text();
    const shouldLog = filterKeywords.length === 0 ||
      filterKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));

    if (shouldLog) {
      logs.push(`[${new Date().toISOString()}] ${text}`);
      console.log(`  [${label}] ${text.substring(0, 150)}`);
    }
  });

  return logs;
}

// ============================================================================
// Test Report Generation
// ============================================================================

/**
 * Write test results to a JSON file
 * @param {string} filename - Output filename
 * @param {object} results - Test results object
 */
function writeTestReport(filename, results) {
  const report = {
    timestamp: new Date().toISOString(),
    ...results,
  };
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${filename}`);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Configuration
  config,

  // Utilities
  sleep,
  generateTestId,
  waitForServicesAlive,

  // UX Tracking
  UxIssueTracker,

  // Screenshots
  ensureScreenshotsDir,
  takeScreenshot,

  // Modals & Dialogs
  closeAnyModals,
  checkForErrors,

  // Workspace
  waitForWorkspaceLoaded,

  // Account Management
  createAccount,

  // P2P Operations
  p2pRegister,
  acceptP2PRequest,
  openConversation,

  // Messaging
  sendMessage,
  verifyMessageReceived,

  // Browser Setup
  createBrowser,
  setupConsoleCapture,

  // Reporting
  writeTestReport,
};
