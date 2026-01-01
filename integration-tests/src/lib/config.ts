/**
 * Test configuration
 */

import * as path from 'path';
import type { TestConfig } from './types.js';

export const config: TestConfig = {
  BASE_URL: 'http://localhost:5173',
  INTERNAL_SERVICE_URL: 'http://127.0.0.1:12345', // Use 127.0.0.1 to avoid IPv6 issues
  WORKSPACE_SERVER: '127.0.0.1:12349',
  WORKSPACE_PASSWORD: 'SUPER_SECRET_ADMIN_PASSWORD_CHANGE_ME',
  DEFAULT_PASSWORD: 'test12345',
  SCREENSHOTS_DIR: path.join(process.cwd(), 'screenshots'),
  LOGS_DIR: path.join(process.cwd(), 'logs'),
};
