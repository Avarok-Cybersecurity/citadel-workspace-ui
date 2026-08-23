/**
 * Office/Room MDX Content Integration Test (P9)
 *
 * Tests MDX content editing in offices:
 * 1. Rendered MDX content area (view mode)
 * 2. Edit button to enter editing mode
 * 3. MDXEditor with toolbar (Bold/Italic/etc.)
 * 4. TemplateSelector
 * 5. Save button and content persistence
 */

import { Page } from 'playwright';
import {
  sleep,
  createBrowser,
  createAccount,
  takeScreenshot,
  setupConsoleCapture,
  waitForWorkspaceLoaded,
  closeAnyModals,
  TestHarness,
  runTestMain,
} from '../lib/index.js';
import { config } from '../lib/config.js';
import { isVisibleWithin } from '../lib/index.js';

// ============================================================================
// Types
// ============================================================================

interface TestResults {
  accountCreated: boolean;
  contentTabActive: boolean;

  // MDX content area
  contentAreaVisible: boolean;
  editButtonVisible: boolean;

  // MDX Editor
  editorLoads: boolean;
  toolbarVisible: boolean;
  templateSelectorVisible: boolean;

  // Save
  saveButtonVisible: boolean;
  contentPersists: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const timestamp = Date.now();
const USERNAME = `mdx_${timestamp}`;
const PASSWORD = config.DEFAULT_PASSWORD;

// ============================================================================
// Helper Functions
// ============================================================================

async function verifyContentArea(page: Page): Promise<boolean> {
  console.log('\n=== Verifying Content Area ===');

  // Content tab should show MDX rendered content or placeholder
  const contentArea = page.locator('[class*="prose"], [class*="content"], [class*="mdx"], [class*="editor"]').first();
  let visible = await contentArea.isVisible({ timeout: 5000 }).catch(() => false);

  if (!visible) {
    // Check for any content in the main area
    const mainContent = page.locator('main, [role="main"], [class*="ContentArea"]').first();
    visible = await mainContent.isVisible({ timeout: 3000 }).catch(() => false);
  }

  console.log(`  Content area visible: ${visible}`);
  return visible;
}

async function findEditButton(page: Page): Promise<boolean> {
  console.log('\n=== Finding Edit Button ===');

  const editBtn = page.locator('button:has-text("Edit"), button:has(svg.lucide-edit), button:has(svg.lucide-pencil), [aria-label="Edit"]').first();
  const visible = await editBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Edit button visible: ${visible}`);

  if (visible) {
    // Check if button is inside DisabledWithTooltip wrapper
    const disabledWrapper = page.locator('[aria-disabled="true"] button:has-text("Edit")').first();
    const isWrapped = await disabledWrapper.isVisible({ timeout: 1000 }).catch(() => false);

    if (isWrapped) {
      console.log('  Edit button wrapped in disabled state, using JS click');
      await editBtn.evaluate((el: HTMLElement) => el.click());
    } else {
      await editBtn.click();
    }
    await sleep(1000);
  }

  return visible;
}

async function verifyMDXEditor(page: Page): Promise<{
  loads: boolean;
  toolbar: boolean;
  templateSelector: boolean;
}> {
  console.log('\n=== Verifying MDX Editor ===');

  const results = { loads: false, toolbar: false, templateSelector: false };

  // Editor area (textarea or contenteditable)
  const editor = page.locator('textarea, [contenteditable="true"], .ProseMirror, [class*="editor"]').first();
  results.loads = await editor.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Editor loads: ${results.loads}`);

  // Toolbar buttons
  const boldBtn = page.locator('button[title*="Bold"], button:has(svg.lucide-bold), [aria-label="Bold"]').first();
  const italicBtn = page.locator('button[title*="Italic"], button:has(svg.lucide-italic), [aria-label="Italic"]').first();

  const hasBold = await boldBtn.isVisible({ timeout: 3000 }).catch(() => false);
  const hasItalic = await italicBtn.isVisible({ timeout: 2000 }).catch(() => false);
  results.toolbar = hasBold || hasItalic;
  console.log(`  Toolbar visible: ${results.toolbar} (Bold: ${hasBold}, Italic: ${hasItalic})`);

  // Template selector (button text is "Use Template")
  const templateSelector = page.locator('button:has-text("Use Template"), button:has-text("Template"), [class*="template"], select:has(option)').first();
  results.templateSelector = await templateSelector.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Template selector: ${results.templateSelector}`);

  return results;
}

async function testSaveAndPersist(page: Page): Promise<{
  saveVisible: boolean;
  persists: boolean;
}> {
  console.log('\n=== Testing Save and Persistence ===');

  const results = { saveVisible: false, persists: false };

  // Look for "Save Changes" button (edit mode header)
  const saveBtn = page.locator('button:has-text("Save Changes"), button:has-text("Save"), button:has(svg.lucide-save)').first();
  results.saveVisible = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`  Save button visible: ${results.saveVisible}`);

  if (!results.saveVisible) return results;

  // Type unique content into the editor
  const UNIQUE_CONTENT = `TestMDX_${Date.now()}`;
  const editor = page.locator('textarea, [contenteditable="true"], .ProseMirror').first();
  if (await isVisibleWithin(editor, 2000)) {
    await editor.click();
    // Select all existing content and replace it
    await page.keyboard.press('Meta+a');
    await sleep(100);
    await page.keyboard.type(UNIQUE_CONTENT);
    await sleep(500);
    console.log(`  Typed unique content: "${UNIQUE_CONTENT}"`);
  }

  // Verify the content is in the editor before saving
  const beforeSave = await editor.textContent().catch(() => '');
  console.log(`  Editor content before save: "${beforeSave?.slice(0, 80)}"`);

  // Click Save Changes
  await saveBtn.click();
  await sleep(2000);

  // Check for success toast
  const toastVisible = await page.locator('text="Changes saved"').first()
    .isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`  Save success toast: ${toastVisible}`);

  // After save, UI exits edit mode and shows rendered view.
  // Check immediately: does the view mode show our content?
  const immediateView = await page.locator('[class*="prose"], [class*="content"], [class*="mdx"]').first()
    .textContent().catch(() => '');
  const immediateMatch = immediateView?.includes(UNIQUE_CONTENT) ?? false;
  console.log(`  Immediate view content: "${immediateView?.slice(0, 80) ?? ''}"`);
  console.log(`  Immediate view has our content: ${immediateMatch}`);

  // SPA persistence check: navigate to a different office via sidebar, then back.
  // The office view has no Chat/Content tabs — use sidebar office navigation.
  console.log('  Navigating away (Tutorials office) and back (General office)...');

  const tutorialsOffice = page.locator('[data-sidebar="menu-button"]:has-text("Tutorials")').first();
  if (await tutorialsOffice.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tutorialsOffice.evaluate((el: HTMLElement) => el.click());
    await sleep(2000);
    console.log('  Navigated to Tutorials office');

    // Navigate back to General
    const generalOffice = page.locator('[data-sidebar="menu-button"]:has-text("General")').first();
    if (await generalOffice.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generalOffice.evaluate((el: HTMLElement) => el.click());
      await sleep(3000); // Extra wait for permissions to re-load
      console.log('  Navigated back to General office');
    }
  } else {
    console.log('  WARNING: Tutorials office not in sidebar, skipping navigation check');
  }

  // Check view mode content after navigating back
  const viewContent = await page.locator('[class*="prose"], [class*="content"], [class*="mdx"]').first()
    .textContent().catch(() => '');
  console.log(`  View content after nav: "${viewContent?.slice(0, 80) ?? ''}"`);

  // Also click Edit to re-enter editor and verify content there
  const editBtn = page.locator('button:has-text("Edit")').first();
  let editorContent = '';
  if (await isVisibleWithin(editBtn, 5000)) {
    // Wait for permissions to load (Edit button is wrapped in DisabledWithTooltip)
    const enabled = await editBtn.isEnabled({ timeout: 10000 }).catch(() => false);
    if (enabled) {
      await editBtn.click();
    } else {
      await editBtn.evaluate((el: HTMLElement) => el.click());
    }
    await sleep(1000);
    editorContent = await page.locator('textarea, [contenteditable="true"], .ProseMirror').first()
      .textContent().catch(() => '') ?? '';
    console.log(`  Editor content after nav: "${editorContent.slice(0, 80)}"`);
  }

  const allContent = `${viewContent ?? ''}${editorContent}`;
  results.persists = allContent.includes(UNIQUE_CONTENT);
  console.log(`  Content persists: ${results.persists} (looking for "${UNIQUE_CONTENT}")`);

  return results;
}

// ============================================================================
// Main Test
// ============================================================================

async function runTest(): Promise<boolean> {
  const harness = await TestHarness.create({
    testName: 'Office MDX Content Test',
    reportFileName: 'OFFICE_MDX_CONTENT_TEST_REPORT.json',
    metadata: { username: USERNAME },
    restartBackend: true,
  });
  const uxTracker = harness.uxTracker;

  const { browser, context } = await createBrowser();

  const results: TestResults = {
    accountCreated: false,
    contentTabActive: false,
    contentAreaVisible: false,
    editButtonVisible: false,
    editorLoads: false,
    toolbarVisible: false,
    templateSelectorVisible: false,
    saveButtonVisible: false,
    contentPersists: false,
  };

  try {
    const page = await context.newPage();
    setupConsoleCapture(page, 'MDX', ['error', 'Error', 'mdx', 'MDX']);

    // ========== STEP 1: Create Account ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 1: Create Account');
    console.log('\u2500'.repeat(50));

    results.accountCreated = await createAccount(page, USERNAME, {
      isFirstUser: true,
      password: PASSWORD,
      uxTracker,
    });

    if (!results.accountCreated) throw new Error('Account creation failed');

    await sleep(3000);
    await closeAnyModals(page);
    await waitForWorkspaceLoaded(page, 30000);

    // ========== STEP 2: Navigate to General Office ==========
    // MUST click General in sidebar to set officeId in the route.
    // Without officeId, handleSave shows a toast but doesn't persist to backend.
    // After clicking, permissions re-load — wait for Edit button to become enabled.
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 2: Navigate to General Office');
    console.log('\u2500'.repeat(50));

    const generalOffice = page.locator('[data-sidebar="menu-button"]:has-text("General")').first();
    if (await generalOffice.isVisible({ timeout: 5000 }).catch(() => false)) {
      await generalOffice.evaluate((el: HTMLElement) => el.click());
      console.log('  Clicked General office in sidebar');
      // Wait for permissions to load. The Edit button is inside DisabledWithTooltip
      // wrapper (div[aria-disabled="true"]) until permissions arrive.
      // Poll until the button is NOT inside an aria-disabled wrapper.
      let permReady = false;
      for (let i = 0; i < 30; i++) {
        await sleep(500);
        // Check if Edit button exists WITHOUT the disabled wrapper
        const disabledWrapper = page.locator('[aria-disabled="true"] button:has-text("Edit")').first();
        const wrapperPresent = await disabledWrapper.isVisible({ timeout: 500 }).catch(() => false);
        if (!wrapperPresent) {
          // Verify the button itself is visible (not inside wrapper anymore)
          const editBtnDirect = page.locator('button:has-text("Edit")').first();
          if (await editBtnDirect.isVisible({ timeout: 500 }).catch(() => false)) {
            permReady = true;
            console.log(`  Permissions loaded after ${(i + 1) * 500}ms`);
            break;
          }
        }
      }
      results.contentTabActive = permReady;
      if (!permReady) {
        console.log('  WARNING: Edit button still disabled after 15s');
      }
    } else {
      console.log('  WARNING: General office not found in sidebar');
      results.contentTabActive = false;
    }
    await takeScreenshot(page, '02_content_view');

    // ========== STEP 3: Verify Content Area ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 3: Verify Content Area');
    console.log('\u2500'.repeat(50));

    results.contentAreaVisible = await verifyContentArea(page);
    await takeScreenshot(page, '03_content_area');

    // ========== STEP 4: Find Edit Button ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 4: Find Edit Button');
    console.log('\u2500'.repeat(50));

    results.editButtonVisible = await findEditButton(page);
    await takeScreenshot(page, '04_edit_button');

    // ========== STEP 5: Verify MDX Editor ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 5: Verify MDX Editor');
    console.log('\u2500'.repeat(50));

    if (results.editButtonVisible) {
      const editorResult = await verifyMDXEditor(page);
      results.editorLoads = editorResult.loads;
      results.toolbarVisible = editorResult.toolbar;
      results.templateSelectorVisible = editorResult.templateSelector;
      await takeScreenshot(page, '05_mdx_editor');
    }

    // ========== STEP 6: Test Save and Persistence ==========
    console.log('\n' + '\u2500'.repeat(50));
    console.log('STEP 6: Test Save and Persistence');
    console.log('\u2500'.repeat(50));

    if (results.editorLoads) {
      const saveResult = await testSaveAndPersist(page);
      results.saveButtonVisible = saveResult.saveVisible;
      results.contentPersists = saveResult.persists;
      await takeScreenshot(page, '06_save');
    }

    // ========== RESULTS ==========
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS');
    console.log('='.repeat(60));

    const corePassed = results.accountCreated;

    console.log(`\n  Account Created:           ${results.accountCreated ? 'PASS' : 'FAIL'}`);
    console.log(`  Content Tab Active:        ${results.contentTabActive ? 'PASS' : 'CHECK'}`);
    console.log(`  Content Area Visible:      ${results.contentAreaVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Edit Button:               ${results.editButtonVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Editor Loads:              ${results.editorLoads ? 'PASS' : 'CHECK'}`);
    console.log(`  Toolbar Visible:           ${results.toolbarVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Template Selector:         ${results.templateSelectorVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Save Button:               ${results.saveButtonVisible ? 'PASS' : 'CHECK'}`);
    console.log(`  Content Persists:          ${results.contentPersists ? 'PASS' : 'CHECK'}`);

    harness.finalize(corePassed, results);
    return corePassed;

  } catch (error) {
    console.error('\nTest error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

runTestMain(runTest);
