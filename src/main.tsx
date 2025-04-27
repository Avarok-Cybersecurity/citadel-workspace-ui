import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { warn, debug, trace, info, error } from '@tauri-apps/plugin-log';

function forwardConsole(
    fnName: 'log' | 'debug' | 'info' | 'warn' | 'error',
    logger: (message: string) => Promise<void> // Logger expects a single string
) {
    const original = console[fnName];
    // Use rest parameters to capture all arguments
    console[fnName] = (...args: any[]) => {
        // Call the original console function with all arguments
        original(...args);
        // Join arguments into a single string for the Tauri logger
        const messageString = args.map(arg => {
            // Attempt to stringify objects/arrays, otherwise use as is
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return '[Unserializable Object]';
                }
            }
            return String(arg);
        }).join(' '); // Join with spaces
        logger(messageString);
    };
}

forwardConsole('log', trace);
forwardConsole('debug', debug);
forwardConsole('info', info);
forwardConsole('warn', warn);
forwardConsole('error', error);

createRoot(document.getElementById("root")!).render(<App />);
