import { createRoot } from 'react-dom/client'
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
});

try {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("Root element not found");
  }

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
