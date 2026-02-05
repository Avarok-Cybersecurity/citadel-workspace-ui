/**
 * Service Helper Functions
 *
 * Utilities for managing backend services during integration tests.
 * These functions use tilt to restart services and ensure clean state.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sleep, waitForServicesAlive } from './utils.js';

/**
 * Get the workspace root directory dynamically.
 * This resolves from integration-tests/src/lib/service-helpers.ts up 3 levels.
 */
function getWorkspaceRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..', '..', '..');
}

/**
 * Restart backend services (server and internal-service) to ensure clean state.
 *
 * This is necessary before tests that depend on admin permissions, since:
 * - The admin user is the first user to join the workspace
 * - If previous test runs left stale state, new users may not get admin role
 *
 * Uses docker compose restart to fully restart containers with clean in-memory state.
 *
 * @param options - Optional configuration
 * @param options.restartTime - Time to wait for restart (default: 10s)
 */
export async function restartBackendServices(options: {
  restartTime?: number;
} = {}): Promise<void> {
  const { restartTime = 10000 } = options;
  const cwd = getWorkspaceRoot();

  console.log('\n' + '='.repeat(60));
  console.log('RESTARTING BACKEND SERVICES FOR CLEAN STATE');
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    // Use `docker restart` directly (NOT docker compose restart/stop/start).
    // docker compose restart can fail with "Address already in use" (os error 98)
    // when the old process doesn't release the port fast enough.
    // docker compose stop/start triggers dependency chains (sync-wasm-client).
    // `docker restart` with --timeout gives the process time to shut down cleanly.
    console.log('\n  Restarting server container...');
    execSync('docker restart --timeout 10 citadel-workspace-server-1', {
      stdio: 'inherit',
      timeout: 60000,
    });

    console.log('  Restarting internal-service container...');
    execSync('docker restart --timeout 10 citadel-workspace-internal-service-1', {
      stdio: 'inherit',
      timeout: 60000,
    });

    // Wait for services to initialize
    console.log(`  Waiting ${restartTime / 1000}s for services to restart...`);
    await sleep(restartTime);

    // Verify containers are actually running (not exited with error)
    console.log('  Verifying containers are running...');
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const psOutput = execSync(
        'docker compose ps -a --format json server internal-service',
        { cwd, timeout: 10000 }
      ).toString();

      const containers = psOutput.trim().split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as { Service: string; State: string });

      const serverContainer = containers.find(c => c.Service === 'server');
      const isContainer = containers.find(c => c.Service === 'internal-service');

      const serverRunning = serverContainer?.State === 'running';
      const isRunning = isContainer?.State === 'running';

      console.log(`    server: ${serverContainer?.State ?? 'not found'}`);
      console.log(`    internal-service: ${isContainer?.State ?? 'not found'}`);

      if (serverRunning && isRunning) {
        break;
      }

      if (attempt < maxRetries) {
        console.log(`  Containers not ready (attempt ${attempt}/${maxRetries}), retrying...`);
        if (!serverRunning) {
          console.log('  Server crashed, restarting with longer timeout...');
          execSync('docker restart --timeout 15 citadel-workspace-server-1', {
            stdio: 'inherit',
            timeout: 60000,
          });
        }
        if (!isRunning) {
          console.log('  Internal service not running, restarting...');
          execSync('docker restart --timeout 15 citadel-workspace-internal-service-1', {
            stdio: 'inherit',
            timeout: 60000,
          });
        }
        await sleep(10000);
      } else {
        throw new Error(
          `Containers not running after ${maxRetries} attempts. ` +
          `server=${serverContainer?.State}, internal-service=${isContainer?.State}`
        );
      }
    }

    // Now verify services respond via TCP
    console.log('  Verifying services are responding...');
    await waitForServicesAlive(60000, 2000);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n  Services restarted successfully in ${elapsed}s`);
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('  ERROR: Failed to restart backend services');
    console.error('  ', error);
    throw error;
  }
}
