/**
 * Test configuration
 *
 * Reads from test.config.json in the project root.
 * To change workspace server, edit test.config.json:
 * {
 *   "workspaceServer": {
 *     "host": "127.0.0.1",
 *     "port": 12349
 *   }
 * }
 */

import * as path from 'path';
import * as fs from 'fs';
import type { TestConfig } from './types.js';

interface ExternalConfig {
  baseUrl?: string;
  internalServiceUrl?: string;
  workspaceServer?: {
    host: string;
    port: number;
  };
  workspacePassword?: string;
  defaultPassword?: string;
}

function loadExternalConfig(): ExternalConfig {
  const configPath = path.join(process.cwd(), 'test.config.json');
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as ExternalConfig;
    }
  } catch (error) {
    console.warn(`Warning: Could not load test.config.json: ${error}`);
  }
  return {};
}

const externalConfig = loadExternalConfig();

export const config: TestConfig = {
  BASE_URL: externalConfig.baseUrl ?? 'http://127.0.0.1:5173',
  INTERNAL_SERVICE_URL: externalConfig.internalServiceUrl ?? 'http://127.0.0.1:12345',
  WORKSPACE_SERVER: externalConfig.workspaceServer
    ? `${externalConfig.workspaceServer.host}:${externalConfig.workspaceServer.port}`
    : '127.0.0.1:12349',
  WORKSPACE_PASSWORD: externalConfig.workspacePassword ?? 'SUPER_SECRET_ADMIN_PASSWORD_CHANGE_ME',
  DEFAULT_PASSWORD: externalConfig.defaultPassword ?? 'test12345',
  SCREENSHOTS_DIR: path.join(process.cwd(), 'screenshots'),
  LOGS_DIR: path.join(process.cwd(), 'logs'),
};
