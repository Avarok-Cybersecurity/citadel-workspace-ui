/**
 * Utility functions for integration tests
 */

import * as net from 'net';
import { config } from './config.js';

/**
 * Sleep for specified milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a unique test ID based on timestamp
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}_${Date.now()}`;
}

/**
 * Check if a TCP port is open (works for HTTP and WebSocket services)
 */
export async function isTcpPortOpen(host: string, port: number, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Check if a service is alive (supports both HTTP and WebSocket services)
 */
export async function isServiceAlive(url: string, timeout = 5000): Promise<boolean> {
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
  return isTcpPortOpen(host, port, timeout);
}

/**
 * Wait for backend services to be alive
 */
export async function waitForServicesAlive(timeout = 180000, pollInterval = 2000): Promise<boolean> {
  console.log('\n=== Waiting for services to be alive ===');
  const startTime = Date.now();

  // Only check UI since internal service is inside Docker and connects via the UI's WebSocket
  const services = [
    { name: 'UI', url: config.BASE_URL },
  ];

  while (Date.now() - startTime < timeout) {
    const results = await Promise.all(
      services.map(async (svc) => ({
        name: svc.name,
        alive: await isServiceAlive(svc.url, 3000),
      }))
    );

    const allAlive = results.every(r => r.alive);

    if (allAlive) {
      console.log('  All services are alive:');
      results.forEach(r => console.log(`    ${r.name}: OK`));
      // Give backend services a moment to fully initialize
      console.log('  Waiting 3s for backend initialization...');
      await sleep(3000);
      return true;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  Waiting... (${elapsed}s elapsed)`);
    results.forEach(r => {
      console.log(`    ${r.name}: ${r.alive ? 'OK' : 'waiting...'}`);
    });

    await sleep(pollInterval);
  }

  throw new Error(`Services did not become alive within ${timeout / 1000}s`);
}
