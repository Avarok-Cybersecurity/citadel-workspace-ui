import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize WASM peer bridge (provides peer connection state to WASM ILM via JS callback)
import { initWasmPeerBridge } from './lib/wasm-peer-bridge'
initWasmPeerBridge();

// Expose singleton services on window for dev tools and integration testing
import { p2pRegistrationService } from './lib/p2p-registration-service';
import { p2pAutoConnectService } from './lib/p2p-auto-connect-service';
import { websocketService } from './lib/websocket-service';
import { connectionManager } from './lib/connection/service';
if (import.meta.env.DEV) {
  (window as unknown as { __p2pRegistrationService: typeof p2pRegistrationService }).__p2pRegistrationService = p2pRegistrationService;
  (window as unknown as { __p2pAutoConnectService: typeof p2pAutoConnectService }).__p2pAutoConnectService = p2pAutoConnectService;
  (window as unknown as { __websocketService: typeof websocketService }).__websocketService = websocketService;
  (window as unknown as { __connectionManager: typeof connectionManager }).__connectionManager = connectionManager;
}

// Initialize instance inbound router (routes WebSocket responses to correct instance)
// Must be imported early to set up event listeners before any messages are processed
import { instanceInboundRouter } from './lib/multi-instance';
void instanceInboundRouter.isRouterActive();

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
