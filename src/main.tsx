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
(window as unknown as { __p2pRegistrationService: typeof p2pRegistrationService }).__p2pRegistrationService = p2pRegistrationService;
(window as unknown as { __p2pAutoConnectService: typeof p2pAutoConnectService }).__p2pAutoConnectService = p2pAutoConnectService;
(window as unknown as { __websocketService: typeof websocketService }).__websocketService = websocketService;
(window as unknown as { __connectionManager: typeof connectionManager }).__connectionManager = connectionManager;

// Initialize instance inbound router (routes WebSocket responses to correct instance)
// Must be imported early to set up event listeners before any messages are processed
console.log('[Main] About to import instance-inbound-router...');
import { instanceInboundRouter } from './lib/multi-instance';
console.log('[Main] instance-inbound-router imported, active:', instanceInboundRouter.isRouterActive());

console.log("main.tsx starting");

// Add error handlers to catch any issues
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
  console.log("main.tsx: Getting root element...");
  const rootElement = document.getElementById("root");
  console.log("main.tsx: Root element found:", !!rootElement);
  
  if (!rootElement) {
    throw new Error("Root element not found");
  }
  
  console.log("main.tsx: Creating React root...");
  const root = createRoot(rootElement);
  console.log("main.tsx: React root created successfully");
  
  console.log("main.tsx: App imported successfully, type:", typeof App);
  console.log("main.tsx: Rendering App...");
  // Test minimal app component
  root.render(<App />);
  console.log("main.tsx: App rendered successfully");
} catch (error) {
  console.error("main.tsx: Error during initialization:", error);

  // Show error on page if React fails
  const rootElement = document.getElementById("root");
  if (rootElement) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    rootElement.innerHTML = `
      <div style="padding: 20px; color: red; font-family: monospace;">
        <h2>React Initialization Error</h2>
        <p><strong>Error:</strong> ${errorMessage}</p>
        <p><strong>Stack:</strong></p>
        <pre>${errorStack}</pre>
      </div>
    `;
  }
}

console.log("main.tsx finished");
