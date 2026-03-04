import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright Test configuration for Citadel Workspaces integration tests.
 *
 * Runs alongside the existing custom test runner. Use `npm run test:pw` to run
 * @playwright/test specs, and the existing `npm run test:*` for legacy tests.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ── Load test configuration from test.config.json ── */

interface ExternalConfig {
    baseUrl?: string;
    internalServiceUrl?: string;
    workspaceServer?: { host: string; port: number };
    workspacePassword?: string;
    defaultPassword?: string;
}

function loadConfig(): ExternalConfig {
    const configPath = join(__dirname, 'test.config.json');
    try {
        if (existsSync(configPath)) {
            return JSON.parse(readFileSync(configPath, 'utf-8')) as ExternalConfig;
        }
    } catch { /* use defaults */ }
    return {};
}

const externalConfig = loadConfig();
const isCI = process.env['IN_CI'] === 'true' || process.env['CI'] === 'true';

export default defineConfig({
    /* Test directory for @playwright/test spec files */
    testDir: './src/tests-pw',
    testMatch: '**/*.spec.ts',

    /* Timeouts */
    timeout: 120_000,        // 2 min per test — WASM cold-start can be slow
    expect: { timeout: 10_000 },

    /* Retries for flaky E2E tests */
    retries: isCI ? 2 : 0,

    /* Sequential in CI to avoid resource contention; parallel locally */
    workers: isCI ? 1 : 2,
    fullyParallel: false,

    /* Reporters */
    reporter: isCI
        ? [['html', { open: 'never' }], ['json', { outputFile: 'reports/results.json' }], ['list']]
        : [['html', { open: 'on-failure' }], ['list']],

    /* Shared settings for all projects */
    use: {
        baseURL: externalConfig.baseUrl ?? 'http://127.0.0.1:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',

        /* Match existing browser.ts anti-throttling flags */
        launchOptions: {
            slowMo: isCI ? 0 : 50,
            args: [
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-ipc-flooding-protection',
                ...(isCI ? [
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-software-rasterizer',
                    '--js-flags=--max-old-space-size=512',
                    '--renderer-process-limit=2',
                    '--disable-features=TranslateUI',
                    '--disable-component-update',
                ] : []),
            ],
        },
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    /* Output directory for test artifacts (traces, screenshots, videos) */
    outputDir: './test-results/pw',
});
