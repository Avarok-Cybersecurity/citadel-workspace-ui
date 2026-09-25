/**
 * The admin "Chat Features" preview lists only what members can use. Reactions exist as
 * types only, so the row said "available" for a feature no chat offers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source: string = readFileSync(join(process.cwd(), 'src/components/admin/tabs/ChatSettingsTab.tsx'), 'utf8');

describe('chat features preview', () => {
  it('marks reactions as planned, like threads', () => {
    expect(source).toContain('Message reactions (planned)');
    expect(source).not.toMatch(/bg-success" \/>\s*Message reactions/);
  });
});
