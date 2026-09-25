/**
 * The admin "Chat Features" preview lists only what members can use.
 *
 * Reactions were types only, so the row said "(planned)". They now ship in P2P
 * chat and peer groups, so the row says available -- and this pins that the
 * claim is backed: the bubbles it describes actually mount the picker. If the
 * picker is removed, the row has to go back to planned.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');
const source: string = read('src/components/admin/tabs/ChatSettingsTab.tsx');

describe('chat features preview', () => {
  it('marks reactions as available', () => {
    expect(source).not.toContain('Message reactions (planned)');
    expect(source).toMatch(/bg-success" \/>\s*Message reactions\s*</);
  });

  it('is backed by a picker in the P2P and the group bubbles', () => {
    for (const bubble of ['src/components/p2p/bubbles/TextBubble.tsx', 'src/components/chat/GroupMessageItem.tsx']) {
      expect(read(bubble)).toContain('<ReactionMenuItems');
      expect(read(bubble)).toContain('<ReactionChips');
    }
  });
});
