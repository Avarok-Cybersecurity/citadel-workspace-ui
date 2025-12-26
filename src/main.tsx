import { createRoot } from 'react-dom/client'
// Import fixed App
import App from './App.tsx'
// import TestApp from './TestApp.tsx'
import './index.css'

// Initialize tab notification service (updates tab title and favicon with unread count)
import './lib/tab-notification-service'

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
    rootElement.innerHTML = `
      <div style="padding: 20px; color: red; font-family: monospace;">
        <h2>React Initialization Error</h2>
        <p><strong>Error:</strong> ${error.message}</p>
        <p><strong>Stack:</strong></p>
        <pre>${error.stack}</pre>
      </div>
    `;
  }
}

console.log("main.tsx finished");
