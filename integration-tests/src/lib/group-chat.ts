/**
 * Group Chat Operations for Integration Tests
 *
 * Provides utility functions for testing office and room group chat functionality.
 */

import type { Page } from 'playwright';
import { sleep } from './utils.js';
import { takeScreenshot } from './screenshots.js';
import type { UxIssueTracker } from './ux-tracker.js';

export interface GroupChatOptions {
  uxTracker?: UxIssueTracker | null;
}

/**
 * Navigate to an office by clicking on it in the sidebar
 */
export async function navigateToOffice(
  page: Page,
  username: string,
  officeName: string,
  _options: GroupChatOptions = {}
): Promise<boolean> {
  console.log(`\n=== ${username}: Navigating to office "${officeName}" ===`);

  try {
    // Try multiple selectors for the office button in the sidebar
    const selectors = [
      `[data-sidebar="menu-button"]:has-text("${officeName}")`,
      `[data-testid^="tree-node-"]:has-text("${officeName}")`,
      `button:has-text("${officeName}")`,
      `a:has-text("${officeName}")`,
    ];

    for (const selector of selectors) {
      const officeLink = page.locator(selector).first();
      if (await officeLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Use JavaScript click to bypass any Playwright click issues
        await officeLink.evaluate((el: HTMLElement) => el.click());
        await sleep(2000);
        console.log(`  Clicked on office "${officeName}" (${selector})`);
        await takeScreenshot(page, `${username}_office_${officeName}`);
        return true;
      }
    }

    // Try expanding hierarchy section first
    const officesHeader = page.locator('text="HIERARCHY", [data-testid="hierarchy-section"]').first();
    if (await officesHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await officesHeader.click();
      await sleep(1000);

      // Try again after expanding
      for (const selector of selectors) {
        const officeLink = page.locator(selector).first();
        if (await officeLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          // Use JavaScript click to bypass any Playwright click issues
          await officeLink.evaluate((el: HTMLElement) => el.click());
          await sleep(2000);
          console.log(`  Clicked on office "${officeName}" (after expanding)`);
          await takeScreenshot(page, `${username}_office_${officeName}`);
          return true;
        }
      }
    }

    console.log(`  WARNING: Could not find office "${officeName}"`);
    return false;
  } catch (error) {
    console.log(`  ERROR navigating to office: ${error}`);
    return false;
  }
}

/**
 * Navigate to a room within an office
 */
export async function navigateToRoom(
  page: Page,
  username: string,
  roomName: string,
  _options: GroupChatOptions = {}
): Promise<boolean> {
  console.log(`\n=== ${username}: Navigating to room "${roomName}" ===`);

  try {
    // Look for the room in the sidebar or room list
    const roomLink = page.locator(`[data-sidebar="menu-button"]:has-text("${roomName}"), a:has-text("${roomName}"), button:has-text("${roomName}")`).first();

    if (await roomLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await roomLink.click();
      await sleep(2000);
      console.log(`  Clicked on room "${roomName}"`);
      await takeScreenshot(page, `${username}_room_${roomName}`);
      return true;
    }

    // Try expanding rooms section first
    const roomsHeader = page.locator('text="Rooms", [data-testid="rooms-section"]').first();
    if (await roomsHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roomsHeader.click();
      await sleep(1000);

      const expandedRoomLink = page.locator(`a:has-text("${roomName}"), button:has-text("${roomName}")`).first();
      if (await expandedRoomLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expandedRoomLink.click();
        await sleep(2000);
        console.log(`  Clicked on room "${roomName}" (after expanding)`);
        await takeScreenshot(page, `${username}_room_${roomName}`);
        return true;
      }
    }

    console.log(`  WARNING: Could not find room "${roomName}"`);
    return false;
  } catch (error) {
    console.log(`  ERROR navigating to room: ${error}`);
    return false;
  }
}

/**
 * Switch to the Chat tab in an office or room
 */
export async function switchToChatTab(
  page: Page,
  username: string,
  options: GroupChatOptions = {}
): Promise<boolean> {
  console.log(`\n=== ${username}: Switching to Chat tab ===`);

  try {
    // Try multiple selectors for the Chat tab trigger
    // The TabsTrigger has value="chat" and data-state attribute
    const selectors = [
      '[role="tab"]:has-text("Chat")',
      'button[value="chat"]',
      '[data-state][value="chat"]',
      'button:has-text("Chat"):not([data-sidebar])', // Exclude sidebar buttons
    ];

    for (const selector of selectors) {
      const chatTab = page.locator(selector).first();
      if (await chatTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await chatTab.click();
        await sleep(1500);
        console.log(`  Switched to Chat tab (${selector})`);
        await takeScreenshot(page, `${username}_chat_tab`);
        return true;
      }
    }

    // Check if chat tab content is already visible (might already be on chat tab)
    const chatView = page.locator('[data-testid="group-chat-view"], .group-chat-view').first();
    if (await chatView.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`  Chat view already visible`);
      return true;
    }

    // Check if message input is visible (indicates we're on chat tab)
    const messageInput = page.locator('textarea[placeholder*="message" i]').first();
    if (await messageInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`  Chat input already visible`);
      return true;
    }

    console.log(`  WARNING: Could not find Chat tab (chat may not be enabled for this office/room)`);
    if (options.uxTracker) {
      options.uxTracker.log('minor', 'functional', 'Chat tab not visible - chat may not be enabled');
    }
    return false;
  } catch (error) {
    console.log(`  ERROR switching to chat tab: ${error}`);
    return false;
  }
}

/**
 * Check if chat is enabled for the current office/room
 */
export async function isChatEnabled(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== ${username}: Checking if chat is enabled ===`);

  // Look for Chat tab (TabsTrigger with text "Chat")
  const selectors = [
    '[role="tab"]:has-text("Chat")',
    'button[value="chat"]',
    '[data-state][value="chat"]',
    'button:has-text("Chat"):not([data-sidebar])',
  ];

  for (const selector of selectors) {
    const chatTab = page.locator(selector).first();
    if (await chatTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`  Chat enabled: true (found ${selector})`);
      return true;
    }
  }

  // Also check if we're already on a chat view
  const chatInput = page.locator('textarea[placeholder*="message" i]').first();
  if (await chatInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`  Chat enabled: true (chat input visible)`);
    return true;
  }

  console.log(`  Chat enabled: false`);
  return false;
}

/**
 * Send a message in the group chat
 */
export async function sendGroupMessage(
  page: Page,
  username: string,
  message: string,
  options: GroupChatOptions = {}
): Promise<boolean> {
  console.log(`\n=== ${username}: Sending group message ===`);
  console.log(`  Message: "${message.substring(0, 50)}..."`);

  try {
    // Find the message input (textarea)
    const messageInput = page.locator('textarea[placeholder*="message"], textarea[placeholder*="Type"], input[placeholder*="message"]').first();

    if (!(await messageInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log(`  WARNING: Message input not found`);
      if (options.uxTracker) {
        options.uxTracker.log('major', 'functional', 'Group chat message input not visible');
      }
      return false;
    }

    // Clear and type the message
    await messageInput.fill(message);
    await sleep(500);

    // Find and click the send button
    const sendButton = page.locator('button:has(svg), button[aria-label*="send"], button[aria-label*="Send"]').last();

    if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendButton.click();
      await sleep(1000);
      console.log(`  Message sent via button`);
    } else {
      // Try pressing Enter instead
      await messageInput.press('Enter');
      await sleep(1000);
      console.log(`  Message sent via Enter key`);
    }

    await takeScreenshot(page, `${username}_sent_group_msg`);
    return true;
  } catch (error) {
    console.log(`  ERROR sending message: ${error}`);
    return false;
  }
}

/**
 * Verify a message appears in the group chat
 */
export async function verifyGroupMessageReceived(
  page: Page,
  username: string,
  expectedMessage: string,
  timeout: number = 15000,
  options: GroupChatOptions = {}
): Promise<boolean> {
  console.log(`\n=== ${username}: Verifying group message received ===`);
  console.log(`  Looking for: "${expectedMessage.substring(0, 50)}..."`);

  try {
    const messageLocator = page.locator(`text="${expectedMessage}"`).first();
    const found = await messageLocator.isVisible({ timeout }).catch(() => false);

    if (found) {
      console.log(`  Message found!`);
      await takeScreenshot(page, `${username}_received_group_msg`);
      return true;
    }

    // Try partial match
    const partialMessage = expectedMessage.substring(0, 20);
    const partialLocator = page.locator(`text="${partialMessage}"`).first();
    const partialFound = await partialLocator.isVisible({ timeout: 5000 }).catch(() => false);

    if (partialFound) {
      console.log(`  Message found (partial match)`);
      return true;
    }

    console.log(`  WARNING: Message not found within ${timeout}ms`);
    if (options.uxTracker) {
      options.uxTracker.log('major', 'functional', `Group message not received: "${expectedMessage.substring(0, 30)}..."`);
    }
    return false;
  } catch (error) {
    console.log(`  ERROR verifying message: ${error}`);
    return false;
  }
}

/**
 * Get the count of messages in the current chat view
 */
export async function getMessageCount(page: Page, username: string): Promise<number> {
  console.log(`\n=== ${username}: Counting messages ===`);

  try {
    // Look for message bubbles/items
    const messages = page.locator('[data-testid="message-item"], .message-item, [class*="message"]');
    const count = await messages.count();
    console.log(`  Found ${count} messages`);
    return count;
  } catch (error) {
    console.log(`  ERROR counting messages: ${error}`);
    return 0;
  }
}

/**
 * Check for message timestamps
 */
export async function checkMessageTimestamps(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== ${username}: Checking message timestamps ===`);

  const timestamps = page.locator('time, [class*="timestamp"], .text-xs.text-gray');
  const count = await timestamps.count();

  if (count > 0) {
    console.log(`  Found ${count} timestamp elements`);
    return true;
  }

  console.log(`  No timestamps found`);
  return false;
}

/**
 * Load older messages (pagination)
 */
export async function loadOlderMessages(
  page: Page,
  username: string,
  _options: GroupChatOptions = {}
): Promise<boolean> {
  console.log(`\n=== ${username}: Loading older messages ===`);

  try {
    const loadMoreBtn = page.locator('button:has-text("Load older"), button:has-text("Load more")').first();

    if (await loadMoreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loadMoreBtn.click();
      await sleep(2000);
      console.log(`  Clicked "Load older messages"`);
      return true;
    }

    console.log(`  No "Load older" button found (may not have more messages)`);
    return false;
  } catch (error) {
    console.log(`  ERROR loading older messages: ${error}`);
    return false;
  }
}

/**
 * Check for the chat rules banner
 */
export async function checkRulesBanner(page: Page, username: string): Promise<string | null> {
  console.log(`\n=== ${username}: Checking for rules banner ===`);

  try {
    const rulesBanner = page.locator('[class*="rules"], [class*="banner"]:has-text("Rule")').first();

    if (await rulesBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      const rulesText = await rulesBanner.textContent();
      console.log(`  Rules found: "${rulesText?.substring(0, 50)}..."`);
      return rulesText;
    }

    console.log(`  No rules banner found`);
    return null;
  } catch (error) {
    console.log(`  ERROR checking rules: ${error}`);
    return null;
  }
}

/**
 * Check if any offices exist in the sidebar
 */
export async function hasOffices(page: Page, username: string): Promise<boolean> {
  console.log(`\n=== ${username}: Checking if offices exist ===`);

  try {
    // Check for "No offices yet" message
    const noOfficesMsg = page.locator('text="No offices yet"').first();
    const noOffices = await noOfficesMsg.isVisible({ timeout: 2000 }).catch(() => false);

    if (noOffices) {
      console.log(`  No offices found (empty state)`);
      return false;
    }

    // Check for known offices from the config (General, Engineering, etc.)
    // These are loaded from workspaces.json and should have chat_enabled: true
    const knownOffices = ['General', 'Engineering', 'Landing Page', 'Tutorials', 'Welcome'];

    for (const officeName of knownOffices) {
      const officeBtn = page.locator(`[data-sidebar="menu-button"]:has-text("${officeName}")`).first();
      if (await officeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`  Found office: ${officeName}`);
        return true;
      }
    }

    // Fallback: Check for any office items in the sidebar
    const officeList = page.locator('[data-sidebar="menu-button"]').first();
    const hasItems = await officeList.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Offices exist: ${hasItems}`);
    return hasItems;
  } catch (error) {
    console.log(`  ERROR checking offices: ${error}`);
    return false;
  }
}

/**
 * Create a new top-level node (e.g. office) via the hierarchy sidebar UI
 */
export async function createOffice(
  page: Page,
  username: string,
  officeName: string,
  description: string = '',
  options: GroupChatOptions = {}
): Promise<boolean> {
  console.log(`\n=== ${username}: Creating node "${officeName}" ===`);

  try {
    // The hierarchy sidebar uses add-node-button for top-level node creation
    console.log('  Looking for Add Node button...');
    const selectors = [
      '[data-testid="add-node-button"]',
      '[data-testid="add-root-node-button"]',
    ];

    let clicked = false;
    for (const selector of selectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await sleep(500);
        console.log(`  Clicked Add Node button (${selector})`);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log(`  WARNING: Could not find add node button`);
      return false;
    }

    await sleep(1000);

    // Fill in node name - use id selector since the input has id="name"
    const nameInput = page.locator('input#name, input[id="name"]').first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill(officeName);
      await sleep(300);
    } else {
      console.log(`  WARNING: Node name input not found`);
      return false;
    }

    // Fill in description - use id selector since textarea has id="description"
    if (description) {
      const descInput = page.locator('textarea#description, textarea[id="description"]').first();
      if (await descInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await descInput.fill(description);
        await sleep(300);
      }
    }

    // Click Create button - NodeManagementModal uses "Create {EntityType}"
    const createBtn = page.locator('button:has-text("Create")').first();
    if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
      await sleep(3000);
    } else {
      console.log(`  WARNING: Create button not found`);
      return false;
    }

    // Check for success or error
    const errorAlert = page.locator('text="Permission denied"').first();
    if (await errorAlert.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`  ERROR: Permission denied when creating node`);
      if (options.uxTracker) {
        options.uxTracker.log('major', 'functional', 'Cannot create node: Permission denied');
      }
      // Close any dialogs
      await page.keyboard.press('Escape');
      return false;
    }

    // Check if node was created
    const nodeInList = page.locator(`button:has-text("${officeName}")`).first();
    if (await nodeInList.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`  Node "${officeName}" created successfully`);
      return true;
    }

    console.log(`  WARNING: Node creation status unclear`);
    return false;
  } catch (error) {
    console.log(`  ERROR creating node: ${error}`);
    return false;
  }
}

/**
 * Switch to the Content tab in an office or room
 */
export async function switchToContentTab(
  page: Page,
  username: string,
  _options: GroupChatOptions = {}
): Promise<boolean> {
  console.log(`\n=== ${username}: Switching to Content tab ===`);

  try {
    const contentTab = page.locator('[data-state][value="content"], button:has-text("Content"), [role="tab"]:has-text("Content")').first();

    if (await contentTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await contentTab.click();
      await sleep(1500);
      console.log(`  Switched to Content tab`);
      return true;
    }

    console.log(`  WARNING: Could not find Content tab`);
    return false;
  } catch (error) {
    console.log(`  ERROR switching to content tab: ${error}`);
    return false;
  }
}
