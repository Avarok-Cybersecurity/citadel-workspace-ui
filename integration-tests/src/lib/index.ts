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
  checkToastState,
  assertNoToastConflict,
  dismissAllToasts,
} from './modals.js';
export type { ToastState } from './modals.js';

// Browser
export {
  createBrowser,
  setupConsoleCapture,
  clearBrowserStorage,
  wakeUpTab,
  createIsolatedContexts,
  createSeparateBrowsers,
  recoverUnresponsiveTab,
  wakeUpTabWithRecovery,
} from './browser.js';
export type { MultiBrowserSetup } from './browser.js';

// Reports
export { writeTestReport } from './report.js';

// Account Management
export { createAccount } from './account.js';

// P2P Operations
export {
  p2pRegister,
  acceptP2PRequest,
  openConversation,
  connectP2P,        // NEW: Explicitly connect to registered P2P peer
  disconnectP2P,     // NEW: Disconnect from P2P peer (C2S stays active)
  disconnectViaNavbar,
  disconnectViaTopBar,
  disconnectViaTcpDrop,
  assertSessionNotInOrphanNavbar,
  assertSessionInOrphanNavbar,
  loginAfterDisconnect,
  reconnectViaClaimSession,
  verifyConnectedBadgeInModal,  // Verify "Connected" badge in Peer Discovery modal
  closePeerDiscoveryModal,      // Close Peer Discovery modal
} from './p2p.js';
export type { P2PRegisterOptions } from './p2p.js';

// Messaging
export { sendMessage, verifyMessageReceived, verifyMessageOrder, verifyMessagesSeen, waitForAllMessages } from './messaging.js';

// Live Documents
export {
  createLiveDoc,
  openLiveDoc,
  typeInLiveDocEditor,
  getLiveDocContent,
  verifyLiveDocContent,
} from './live-docs.js';

// Group Chat
export {
  navigateToOffice,
  navigateToRoom,
  switchToChatTab,
  switchToContentTab,
  isChatEnabled,
  sendGroupMessage,
  verifyGroupMessageReceived,
  getMessageCount,
  checkMessageTimestamps,
  loadOlderMessages,
  checkRulesBanner,
  hasOffices,
  createOffice,
} from './group-chat.js';

// Diagnostics - Console error/warning collector and white-screen detector
export {
  startDiagnostics,
  printDiagnosticsReport,
  isWhiteScreen,
} from './diagnostics.js';
export type {
  ConsoleMessage,
  ConsoleMessageType,
  WhiteScreenCheck,
  DiagnosticsReport,
  DiagnosticsHandle,
} from './diagnostics.js';

// Service Helpers - Backend service management
export { restartBackendServices } from './service-helpers.js';

// Group Chat Test Helpers - Parameterized multi-user group tests
export {
  createNUsers,
  navigateAllToOffice,
  navigateAllToRoom,
  switchAllToChatTab,
  testBidirectionalMessaging,
  printGroupTestResults,
  calculateAllPassed,
} from './group-helpers.js';
export type {
  UserSession,
  GroupTestConfig,
  GroupTestResults,
  MessageTestResult,
} from './group-helpers.js';
