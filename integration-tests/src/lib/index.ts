/**
 * Citadel Workspace Integration Test Library
 *
 * Re-exports all utilities for Playwright-based integration tests.
 */

// Types
export type {
  TestConfig,
  UxSeverity,
  UxCategory,
  UxIssue,
  CreateAccountOptions,
  BrowserOptions,
  BrowserSetup,
  DebugObservation,
  TestReport,
} from './types.js';

// Configuration
export { config } from './config.js';

// Utilities
export {
  sleep,
  generateTestId,
  isTcpPortOpen,
  isServiceAlive,
  waitForServicesAlive,
} from './utils.js';

// UX Tracking
export { UxIssueTracker } from './ux-tracker.js';

// Debug Observation
export { logObservation } from './observation.js';

// Screenshots
export { ensureScreenshotsDir, takeScreenshot } from './screenshots.js';

// Modals and Dialogs
export {
  closeAnyModals,
  checkForErrors,
  waitForWorkspaceLoaded,
} from './modals.js';

// Browser
export { createBrowser, setupConsoleCapture, clearBrowserStorage } from './browser.js';

// Reports
export { writeTestReport } from './report.js';

// Account Management
export { createAccount } from './account.js';

// P2P Operations
export {
  p2pRegister,
  acceptP2PRequest,
  openConversation,
} from './p2p.js';

// Messaging
export { sendMessage, verifyMessageReceived } from './messaging.js';

// Live Documents
export {
  createLiveDoc,
  openLiveDoc,
  typeInLiveDocEditor,
  getLiveDocContent,
  verifyLiveDocContent,
} from './live-docs.js';
