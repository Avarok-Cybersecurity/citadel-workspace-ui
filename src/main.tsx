import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'

// Initialize WASM peer bridge (provides peer connection state to WASM ILM via JS callback)
import { initWasmPeerBridge } from './lib/wasm-peer-bridge'
initWasmPeerBridge();

// Expose singleton services on window for dev tools and integration testing.
//
// These are imported DYNAMICALLY inside the DEV branch, not at module scope. A
// static import runs regardless of the `if`, so the production bundle carried
// four service modules whose only purpose was to be assigned to window in
// development — and, because they sit on the entry chunk's import graph, they
// were fetched and evaluated before React could paint anything. Rollup drops
// this branch entirely from a production build.
if (import.meta.env.DEV) {
  void Promise.all([
    import('./lib/p2p-registration-service'),
    import('./lib/p2p-auto-connect-service'),
    import('./lib/websocket-service'),
    import('./lib/connection/service'),
    import('./lib/server-auto-connect-service'),
  ]).then(([reg, auto, ws, conn, serverAuto]) => {
    window.__p2pRegistrationService = reg.p2pRegistrationService;
    window.__p2pAutoConnectService = auto.p2pAutoConnectService;
    window.__websocketService = ws.websocketService;
    window.__connectionManager = conn.connectionManager;
    // Exposed so a test can wait for the reconnect cycle to go quiet
    // (getPendingReconnectCount() === 0) instead of sleeping out its ~30s poll
    // interval. Two specs were spending 35s each doing exactly that.
    window.__serverAutoConnectService = serverAuto.serverAutoConnectService;
  });
}

// Initialize instance inbound router (routes WebSocket responses to correct instance)
// Must be imported early to set up event listeners before any messages are processed
import { instanceInboundRouter } from './lib/multi-instance';
void instanceInboundRouter.isRouterActive();

// Construct the P2P messenger during boot so its 'websocket-message'
// subscription — the gate the inbound router acks forwarded messages on —
// attaches without waiting for someone to open chat.
//
// It is a LAZY singleton behind a Proxy, so a tab that never touches chat UI
// never constructed it, never marked itself ready, and every forward to that
// tab therefore waited out the full retention timeout before the leader fell
// back. Correct, but two seconds slower than it needs to be, on every message.
//
// Imported dynamically, exactly like the dev services above: a static import
// would put the whole P2P graph on the entry chunk and onto the landing
// critical path, which has ~11KB of headroom against its budget. This keeps
// the eager construction without paying for it before first paint.
void import('./lib/p2p').then((m) => {
  void m.p2pMessengerManager.waitForReady();
});

// Global error handlers
window.addEventListener('error', (e) => {
  console.error('[MAIN ERROR]', {
    message: e.error?.message || e.message,
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
    stack: e.error?.stack
  });
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[MAIN REJECTION]', {
    reason: e.reason,
    promise: e.promise
  });

  // A VersionError means the on-disk IndexedDB is NEWER than this build expects
  // — the normal, expected state during a ROLLBACK, and for anyone running a
  // stale cached bundle. IndexedDB has no downgrade path.
  //
  // storage-utils diagnoses this precisely, but only through `errorLog`, which
  // is gated behind the diagnostics flag, and then rethrows into an async
  // effect where React error boundaries cannot reach it. The result was a
  // permanently spinning loader with no error, no toast and no recovery action
  // — on the one operation you reach for during an incident. Support sees "the
  // app just spins".
  const reason: unknown = e.reason;
  if (reason instanceof DOMException && reason.name === 'VersionError') {
    e.preventDefault();
    showStorageVersionRecovery();
  }
});

/**
 * A recovery screen for the rollback case, built with safe DOM APIs.
 *
 * Unregisters the service worker before reloading: the stale bundle is very
 * often being served FROM the worker's precache, so a plain reload would hand
 * the user the same old build and the same error.
 */
function showStorageVersionRecovery(): void {
  const rootElement = document.getElementById('root');
  if (!rootElement || rootElement.dataset.recovery === 'storage-version') return;
  rootElement.dataset.recovery = 'storage-version';
  rootElement.replaceChildren();

  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'max-width:34rem;margin:12vh auto;padding:2rem;font-family:system-ui,sans-serif;line-height:1.6';

  const heading = document.createElement('h1');
  heading.textContent = 'This version is older than your saved data';
  heading.style.cssText = 'font-size:1.25rem;margin:0 0 0.75rem';

  const body = document.createElement('p');
  body.textContent =
    'Your browser is running an older build of Citadel than the data stored on this device. ' +
    'That usually means a cached copy loaded, or the app was rolled back. Getting the current ' +
    'version will fix it — your data is untouched.';
  body.style.cssText = 'margin:0 0 1.25rem';

  const button = document.createElement('button');
  button.textContent = 'Get the current version';
  button.style.cssText =
    'padding:0.6rem 1rem;border-radius:0.5rem;border:1px solid currentColor;background:transparent;' +
    'color:inherit;font:inherit;cursor:pointer';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Reloading…';
    void navigator.serviceWorker?.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch(() => undefined)
      .finally(() => window.location.reload());
  });

  panel.append(heading, body, button);
  rootElement.append(panel);
}

try {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("Root element not found");
  }

  // Register the service worker OUTSIDE React, before rendering.
  //
  // The only registration used to be `useRegisterSW` inside PwaUpdatePrompt,
  // which mounts inside AppErrorBoundary. A build that threw during render
  // therefore took the update path down with it: the boundary replaced the
  // tree, `registration.update()` never ran, and the reload button re-served
  // the same precached shell. Users were stuck on the broken build with no way
  // to receive the fix — the one failure a prompt-mode PWA must not have,
  // because shipping a correction is the whole recovery plan.
  //
  // Registration is idempotent per scope, so PwaUpdatePrompt's hook attaches to
  // this same registration and keeps owning the toast and the reload action.
  const updateSW = registerSW({
    immediate: true,
    onRegisterError: (error: unknown) => console.error('Service worker registration failed:', error),
  });
  void updateSW;

  // And keep checking, whatever the app is doing. PwaUpdatePrompt polls hourly
  // while it is mounted; this interval survives a crashed render, which is
  // exactly the case where a new build matters most.
  const UPDATE_CHECK_MS = 60 * 60 * 1000;
  window.setInterval(() => {
    navigator.serviceWorker?.getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined);
  }, UPDATE_CHECK_MS);

  const root = createRoot(rootElement);
  root.render(<App />);
} catch (error) {
  console.error("main.tsx: Error during initialization:", error);

  // Show error on page if React fails — use safe DOM APIs (no innerHTML)
  const rootElement = document.getElementById("root");
  if (rootElement) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack ?? '' : '';

    const container = document.createElement('div');
    container.style.cssText = 'padding: 20px; color: red; font-family: monospace;';

    const heading = document.createElement('h2');
    heading.textContent = 'React Initialization Error';

    const errorParagraph = document.createElement('p');
    const errorLabel = document.createElement('strong');
    errorLabel.textContent = 'Error: ';
    errorParagraph.appendChild(errorLabel);
    errorParagraph.appendChild(document.createTextNode(errorMessage));

    const stackLabel = document.createElement('p');
    const stackStrong = document.createElement('strong');
    stackStrong.textContent = 'Stack:';
    stackLabel.appendChild(stackStrong);

    const stackPre = document.createElement('pre');
    stackPre.textContent = errorStack;

    container.appendChild(heading);
    container.appendChild(errorParagraph);
    container.appendChild(stackLabel);
    container.appendChild(stackPre);

    rootElement.textContent = '';
    rootElement.appendChild(container);
  }
}
