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
 * How long to let the stack come back before calling it broken.
 *
 * Generous on purpose: the server takes noticeably longer to start once a run
 * has built up workspaces and accounts, and a premature failure here aborts a
 * spec for reasons that have nothing to do with what it was testing.
 */
const CONTAINER_READY_TIMEOUT_MS = 120_000;
const CONTAINER_POLL_INTERVAL_MS = 2_000;

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
 * Takes no timing options. It used to accept a `restartTime` to sleep for, which
 * callers had to guess at; it now waits on the containers' own health status,
 * so it returns as soon as the stack is genuinely up and does not need tuning.
 */
export async function restartBackendServices(): Promise<void> {
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

    // Wait for both containers to report healthy, polling the real state rather
    // than sleeping a fixed 10s and then checking three times in a row with no
    // gap between the attempts.
    //
    // That older shape is what made this fail: after `docker restart` it
    // re-read `docker compose ps` immediately, so a container still coming up
    // read as `exited`, it "recovered" it with another restart, checked again
    // with no delay, and gave up after three rounds — while the server was in
    // fact fine moments later. Health is the signal the compose file already
    // defines; waiting on it returns as soon as the stack is genuinely ready
    // and tolerates a slow start without hiding a real crash.
    console.log('  Waiting for containers to report healthy...');

    const deadline = Date.now() + CONTAINER_READY_TIMEOUT_MS;
    let lastState = '';
    let restartedOnce = false;

    for (;;) {
      const psOutput = execSync(
        'docker compose ps -a --format json server internal-service',
        { cwd, timeout: 10000 }
      ).toString();

      const containers = psOutput.trim().split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as { Service: string; State: string; Health?: string });

      const server = containers.find(c => c.Service === 'server');
      const internal = containers.find(c => c.Service === 'internal-service');

      // Health is empty for containers without a healthcheck; treat running as
      // sufficient there rather than waiting for a status that never arrives.
      const ready = (c?: { State: string; Health?: string }) =>
        c?.State === 'running' && (!c.Health || c.Health === 'healthy');

      const state = `server=${server?.State}/${server?.Health || 'no-healthcheck'}, ` +
        `internal-service=${internal?.State}/${internal?.Health || 'no-healthcheck'}`;
      if (state !== lastState) {
        console.log(`    ${state}`);
        lastState = state;
      }

      if (ready(server) && ready(internal)) break;

      // A container that has actually exited will not recover on its own, so
      // restart it once — but only once, and then keep waiting rather than
      // restarting on every poll.
      if (!restartedOnce && (server?.State === 'exited' || internal?.State === 'exited')) {
        restartedOnce = true;
        console.log('  A container exited; restarting it once and continuing to wait...');
        if (server?.State === 'exited') {
          execSync('docker restart --timeout 15 citadel-workspace-server-1', { stdio: 'inherit', timeout: 60000 });
        }
        if (internal?.State === 'exited') {
          execSync('docker restart --timeout 15 citadel-workspace-internal-service-1', { stdio: 'inherit', timeout: 60000 });
        }
      }

      if (Date.now() > deadline) {
        throw new Error(
          `Containers did not become healthy within ${CONTAINER_READY_TIMEOUT_MS / 1000}s. Last seen: ${state}`
        );
      }

      await sleep(CONTAINER_POLL_INTERVAL_MS);
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
