/**
 * Test report generation
 */

import * as fs from 'fs';
import type { TestReport } from './types.js';

/**
 * Write test results to a JSON file
 */
export function writeTestReport(filename: string, results: Record<string, unknown>): void {
  const report: TestReport = {
    timestamp: new Date().toISOString(),
    ...results,
  };
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${filename}`);
}
