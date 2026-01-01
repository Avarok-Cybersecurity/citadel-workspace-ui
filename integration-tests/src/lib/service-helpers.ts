/**
 * Service Helper Functions
 *
 * Utilities for managing backend services during integration tests.
 * These functions use tilt to restart services and ensure clean state.
 */

import { execSync } from 'child_process';
import { sleep, waitForServicesAlive } from './utils.js';

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

  console.log('\n' + '='.repeat(60));
  console.log('RESTARTING BACKEND SERVICES FOR CLEAN STATE');
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    // Use docker compose restart to fully restart containers
    // This clears the in-memory state (unlike tilt trigger which hot-reloads)
    console.log('\n  Restarting server container...');
    execSync('docker compose restart server', {
      stdio: 'inherit',
      cwd: '/Volumes/nvme/Development/avarok/citadel-workspace/citadel-workspaces',
    });

    console.log('  Restarting internal-service container...');
    execSync('docker compose restart internal-service', {
      stdio: 'inherit',
      cwd: '/Volumes/nvme/Development/avarok/citadel-workspace/citadel-workspaces',
    });

    // Wait for services to restart
    console.log(`  Waiting ${restartTime / 1000}s for services to restart...`);
    await sleep(restartTime);

    // Now verify services are up via TCP
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
