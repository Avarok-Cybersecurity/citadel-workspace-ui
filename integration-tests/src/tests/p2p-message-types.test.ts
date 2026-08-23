/**
 * P2P Message Types & Chat Features Integration Test (P3)
 *
 * Tests extended P2P chat features:
 * 1. TypeSelectorBar (Text / Markdown / Live Doc buttons)
 * 2. MarkdownToolbar (Bold, Italic, etc.)
 * 3. MarkdownBubble (formatted message display)
 * 4. Message context menu (edit/delete/reply)
 * 5. ChatSettingsPanel (settings drawer)
 */

import { Page } from 'playwright';
import {
  sleep,
  createSeparateBrowsers,
  createAccount,
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  sendMessage,
  takeScreenshot,
  setupConsoleCapture,
  waitForP2PReady,
  TestHarness,
  runTestMain,
} from '../lib/index.js';
import { config } from '../lib/config.js';
import { isVisibleWithin } from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreation: { user1: boolean; user2: boolean };
  p2pRegistration: boolean;
  p2pAccept: boolean;
  conversationOpened: boolean;

  // TypeSelectorBar
  typeSelectorVisible: boolean;
  textButtonVisible: boolean;
  markdownButtonVisible: boolean;
  liveDocButtonVisible: boolean;

  // Markdown mode
  markdownToolbarAppears: boolean;
  boldButtonVisible: boolean;
  italicButtonVisible: boolean;
  markdownMessageSent: boolean;
  markdownBubbleRendered: boolean;

  // Message context menu
  contextMenuTriggerVisible: boolean;
  contextMenuOpens: boolean;

  // ChatSettingsPanel
  chatSettingsOpens: boolean;
  chatSettingsHasTabs: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USER1 = `p2ptype_a_${timestamp}`;
const USER2 = `p2ptype_b_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify TypeSelectorBar renders with all buttons
 */
async function verifyTypeSelectorBar(page: Page): Promise<{
  visible: boolean;
  textBtn: boolean;
  markdownBtn: boolean;
  liveDocBtn: boolean;
}> {
  console.log('\n=== Verifying TypeSelectorBar ===');

  const results = { visible: false, textBtn: false, markdownBtn: false, liveDocBtn: false };

  // TypeSelectorBar buttons use title attributes
  const textBtn = page.locator('button[title="Text"], button:has-text("Text")').first();
  const markdownBtn = page.locator('button[title="Markdown"], button:has-text("Markdown")').first();
  const liveDocBtn = page.locator('button[title="Live Doc"], button:has-text("Live Doc")').first();

  results.textBtn = await textBtn.isVisible({ timeout: 5000 }).catch(() => false);
  results.markdownBtn = await markdownBtn.isVisible({ timeout: 3000 }).catch(() => false);
  results.liveDocBtn = await liveDocBtn.isVisible({ timeout: 3000 }).catch(() => false);

  results.visible = results.textBtn || results.markdownBtn || results.liveDocBtn;

  console.log(`  Text: ${results.textBtn}, Markdown: ${results.markdownBtn}, LiveDoc: ${results.liveDocBtn}`);
  return results;
}

/**
 * Switch to Markdown mode and verify toolbar
 */
async function testMarkdownMode(page: Page): Promise<{
  toolbarAppears: boolean;
  boldVisible: boolean;
  italicVisible: boolean;
}> {
  console.log('\n=== Testing Markdown Mode ===');

  const results = { toolbarAppears: false, boldVisible: false, italicVisible: false };

  // Click Markdown button
  const markdownBtn = page.locator('button[title="Markdown"], button:has-text("Markdown")').first();
  if (!(await markdownBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('  Markdown button not found');
    return results;
  }

  await markdownBtn.click();
  await sleep(500);

  // Verify MarkdownToolbar appeared
  const boldBtn = page.locator('button[title*="Bold"], button:has(svg.lucide-bold)').first();
  const italicBtn = page.locator('button[title*="Italic"], button:has(svg.lucide-italic)').first();

  results.boldVisible = await boldBtn.isVisible({ timeout: 3000 }).catch(() => false);
  results.italicVisible = await italicBtn.isVisible({ timeout: 3000 }).catch(() => false);
  results.toolbarAppears = results.boldVisible || results.italicVisible;

  console.log(`  Toolbar: ${results.toolbarAppears}, Bold: ${results.boldVisible}, Italic: ${results.italicVisible}`);
  return results;
}

/**
 * Send a markdown message and verify it renders
 */
async function sendMarkdownMessage(page: Page, username: string): Promise<{
  sent: boolean;
  rendered: boolean;
}> {
  console.log(`\n=== ${username}: Sending Markdown Message ===`);

  const results = { sent: false, rendered: false };

  // Type markdown content in the input
  const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]').first();
  if (!(await messageInput.isVisible({ timeout: 3000 }).catch(() => false))) {
    console.log('  Message input not found');
    return results;
  }

  await messageInput.fill('**Bold text** and *italic text*');
  await sleep(300);

  // Click send
  const sendBtn = page.locator('button[type="submit"]').last();
  if (await isVisibleWithin(sendBtn, 2000)) {
    await sendBtn.click();
    await sleep(2000);
    results.sent = true;
    console.log('  Markdown message sent');
  }

  // Check if a MarkdownBubble rendered (prose class or rendered markdown)
  const markdownBubble = page.locator('.prose, [class*="markdown"], [data-message-type="markdown"]').first();
  results.rendered = await markdownBubble.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Markdown bubble rendered: ${results.rendered}`);

  return results;
}

/**
 * Test message context menu
 */
async function testMessageContextMenu(page: Page): Promise<{
  triggerVisible: boolean;
  menuOpens: boolean;
}> {
  console.log('\n=== Testing Message Context Menu ===');

  const results = { triggerVisible: false, menuOpens: false };

  // First, switch back to Text mode and send a plain message
  const textBtn = page.locator('button[title="Text"], button:has-text("Text")').first();
  if (await isVisibleWithin(textBtn, 2000)) {
    await textBtn.click();
    await sleep(300);
  }

  await sendMessage(page, 'p2ptype', 'Test message for context menu');
  await sleep(2000);

  // Hover over the last sent message to reveal context menu trigger
  const messages = page.locator('[data-message-id], [class*="message"], [class*="bubble"]');
  const messageCount = await messages.count();

  if (messageCount > 0) {
    const lastMessage = messages.last();
    await lastMessage.hover();
    await sleep(500);

    // Look for the MoreVertical icon (context menu trigger)
    const moreBtn = page.locator('button:has(svg.lucide-more-vertical), button:has(svg.lucide-ellipsis-vertical), [aria-label="More options"]').first();
    results.triggerVisible = await moreBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`  Context menu trigger visible: ${results.triggerVisible}`);

    if (results.triggerVisible) {
      await moreBtn.click();
      await sleep(500);

      // Check for menu items
      const replyOption = page.locator('[role="menuitem"]:has-text("Reply"), button:has-text("Reply")').first();
      const editOption = page.locator('[role="menuitem"]:has-text("Edit"), button:has-text("Edit")').first();
      const deleteOption = page.locator('[role="menuitem"]:has-text("Delete"), button:has-text("Delete")').first();

      const hasReply = await replyOption.isVisible({ timeout: 2000 }).catch(() => false);
      const hasEdit = await editOption.isVisible({ timeout: 2000 }).catch(() => false);
      const hasDelete = await deleteOption.isVisible({ timeout: 2000 }).catch(() => false);

      results.menuOpens = hasReply || hasEdit || hasDelete;
      console.log(`  Menu opens: ${results.menuOpens} (Reply: ${hasReply}, Edit: ${hasEdit}, Delete: ${hasDelete})`);

      // Close menu
      await page.keyboard.press('Escape');
      await sleep(300);
    }
  } else {
    console.log('  No messages found to test context menu');
  }

  return results;
}

/**
 * Test ChatSettingsPanel
 */
async function testChatSettingsPanel(page: Page): Promise<{
  opens: boolean;
  hasTabs: boolean;
}> {
  console.log('\n=== Testing Chat Settings Panel ===');

  const results = { opens: false, hasTabs: false };

  // Look for settings/gear icon in chat header
  const settingsBtn = page.locator('button:has(svg.lucide-settings), button:has(svg.lucide-settings-2), [aria-label="Settings"]').first();
  if (!(await settingsBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    // Try the panel toggle button
    const panelToggle = page.locator('button:has(svg.lucide-panel-right), button:has(svg.lucide-sidebar-right)').first();
    if (await isVisibleWithin(panelToggle, 3000)) {
      await panelToggle.click();
      await sleep(1000);
    } else {
      console.log('  Settings button not found');
      return results;
    }
  } else {
    await settingsBtn.click();
    await sleep(1000);
  }

  // Check if ChatSettingsPanel opened (has tabs: General, File, Advanced, Stats)
  const generalTab = page.locator('[data-testid="tab-general"]');
  const fileTab = page.locator('[data-testid="tab-file"]');
  const advancedTab = page.locator('[data-testid="tab-advanced"]');

  const hasGeneral = await generalTab.isVisible({ timeout: 3000 }).catch(() => false);
  const hasFile = await fileTab.isVisible({ timeout: 2000 }).catch(() => false);
  const hasAdvanced = await advancedTab.isVisible({ timeout: 2000 }).catch(() => false);

  results.opens = hasGeneral || hasFile || hasAdvanced;
  results.hasTabs = hasGeneral || hasFile || hasAdvanced;
  console.log(`  Panel opens: ${results.opens} (General: ${hasGeneral}, File: ${hasFile}, Advanced: ${hasAdvanced})`);

  return results;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'P2P Message Types & Chat Features Test',
    reportFileName: 'P2P_MESSAGE_TYPES_TEST_REPORT.json',
    metadata: { user1: USER1, user2: USER2 },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  console.log(`User1: ${USER1}`);
  console.log(`User2: ${USER2}`);
  console.log('');

  const { pages, cleanup } = await createSeparateBrowsers(2);
  const [page1, page2] = pages;

  const results: TestResults = {
    accountCreation: { user1: false, user2: false },
    p2pRegistration: false,
    p2pAccept: false,
    conversationOpened: false,
    typeSelectorVisible: false,
    textButtonVisible: false,
    markdownButtonVisible: false,
    liveDocButtonVisible: false,
    markdownToolbarAppears: false,
    boldButtonVisible: false,
    italicButtonVisible: false,
    markdownMessageSent: false,
    markdownBubbleRendered: false,
    contextMenuTriggerVisible: false,
    contextMenuOpens: false,
    chatSettingsOpens: false,
    chatSettingsHasTabs: false,
  };

  try {
    setupConsoleCapture(page1, 'User1', ['error', 'Error', 'P2P']);
    setupConsoleCapture(page2, 'User2', ['error', 'Error', 'P2P']);

    // ========== STEP 1: Create Accounts ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 1: Create Accounts');
    console.log('\u2500'.repeat(50));

    results.accountCreation.user1 = await createAccount(page1, USER1, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });
    results.accountCreation.user2 = await createAccount(page2, USER2, {
      isFirstUser: false,
      password: PASSWORD,
      uxTracker,
    });

    await takeScreenshot(page1, '01_user1_created');
    await takeScreenshot(page2, '01_user2_created');

    if (!results.accountCreation.user1 || !results.accountCreation.user2) {
      throw new Error('Account creation failed');
    }

    // ========== STEP 2: P2P Registration ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 2: P2P Registration');
    console.log('\u2500'.repeat(50));

    results.p2pRegistration = await p2pRegister(page1, USER1, USER2);
    await sleep(3000);
    results.p2pAccept = await acceptP2PRequest(page2, USER2);

    console.log('  Waiting for P2P connection...');
    await sleep(5000);

    // Wait for P2P ready
    await waitForP2PReady(page1, USER1, USER2, 30000);

    // ========== STEP 3: Open Conversation ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 3: Open Conversation');
    console.log('\u2500'.repeat(50));

    results.conversationOpened = await openConversation(page1, USER1, USER2);
    await takeScreenshot(page1, '03_conversation_opened');

    if (!results.conversationOpened) {
      console.log('  WARNING: Could not open conversation');
    }

    // Send a warmup message to establish channel
    await sendMessage(page1, USER1, 'Warmup message');
    await sleep(3000);

    // ========== STEP 4: Verify TypeSelectorBar ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 4: Verify TypeSelectorBar');
    console.log('\u2500'.repeat(50));

    const selectorResult = await verifyTypeSelectorBar(page1);
    results.typeSelectorVisible = selectorResult.visible;
    results.textButtonVisible = selectorResult.textBtn;
    results.markdownButtonVisible = selectorResult.markdownBtn;
    results.liveDocButtonVisible = selectorResult.liveDocBtn;
    await takeScreenshot(page1, '04_type_selector');

    // ========== STEP 5: Test Markdown Mode ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 5: Test Markdown Mode');
    console.log('\u2500'.repeat(50));

    const markdownResult = await testMarkdownMode(page1);
    results.markdownToolbarAppears = markdownResult.toolbarAppears;
    results.boldButtonVisible = markdownResult.boldVisible;
    results.italicButtonVisible = markdownResult.italicVisible;
    await takeScreenshot(page1, '05_markdown_toolbar');

    // ========== STEP 6: Send Markdown Message ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 6: Send Markdown Message');
    console.log('\u2500'.repeat(50));

    const sendResult = await sendMarkdownMessage(page1, USER1);
    results.markdownMessageSent = sendResult.sent;
    results.markdownBubbleRendered = sendResult.rendered;
    await takeScreenshot(page1, '06_markdown_message');

    // ========== STEP 7: Test Context Menu ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 7: Test Message Context Menu');
    console.log('\u2500'.repeat(50));

    const contextResult = await testMessageContextMenu(page1);
    results.contextMenuTriggerVisible = contextResult.triggerVisible;
    results.contextMenuOpens = contextResult.menuOpens;
    await takeScreenshot(page1, '07_context_menu');

    // ========== STEP 8: Test Chat Settings Panel ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 8: Test Chat Settings Panel');
    console.log('\u2500'.repeat(50));

    const settingsResult = await testChatSettingsPanel(page1);
    results.chatSettingsOpens = settingsResult.opens;
    results.chatSettingsHasTabs = settingsResult.hasTabs;
    await takeScreenshot(page1, '08_chat_settings');

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed = results.accountCreation.user1 && results.accountCreation.user2 && results.conversationOpened;

    console.log('\nAccounts:');
    console.log(`  User1 Created:             ${results.accountCreation.user1 ? 'PASS' : 'FAIL'}`);
    console.log(`  User2 Created:             ${results.accountCreation.user2 ? 'PASS' : 'FAIL'}`);
    console.log(`  P2P Registered:            ${results.p2pRegistration ? 'PASS' : 'CHECK'}`);
    console.log(`  P2P Accepted:              ${results.p2pAccept ? 'PASS' : 'CHECK'}`);

    console.log('\nTypeSelectorBar:');
    console.log(`  Visible:                   ${results.typeSelectorVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Text Button:               ${results.textButtonVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Markdown Button:           ${results.markdownButtonVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Live Doc Button:           ${results.liveDocButtonVisible ? 'PASS' : 'CHECK'}`);

    console.log('\nMarkdown Mode:');
    console.log(`  Toolbar Appears:           ${results.markdownToolbarAppears ? 'PASS' : 'CHECK'}`);
    console.log(`  Bold Button:               ${results.boldButtonVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Italic Button:             ${results.italicButtonVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Message Sent:              ${results.markdownMessageSent ? 'PASS' : 'CHECK'}`);
    console.log(`  Bubble Rendered:           ${results.markdownBubbleRendered ? 'PASS' : 'CHECK'}`);

    console.log('\nContext Menu:');
    console.log(`  Trigger Visible:           ${results.contextMenuTriggerVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Menu Opens:                ${results.contextMenuOpens ? 'PASS' : 'CHECK'}`);

    console.log('\nChat Settings Panel:');
    console.log(`  Opens:                     ${results.chatSettingsOpens ? 'PASS' : 'CHECK'}`);
    console.log(`  Has Tabs:                  ${results.chatSettingsHasTabs ? 'PASS' : 'CHECK'}`);

    harness.finalize(corePassed, results);
    return corePassed;

  } catch (error) {
    console.error('\nTest error:', error);
    throw error;
  } finally {
    await cleanup();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runTestMain(runTest);
