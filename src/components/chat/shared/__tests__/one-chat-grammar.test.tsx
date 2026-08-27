/**
 * Two chat surfaces, one product.
 *
 * Group chat and P2P chat had drifted into visibly different designs for the
 * same thing: group showed date separators and P2P showed none, and the two
 * used different greys for a received bubble — 17% vs 22% lightness in dark
 * mode. Anyone who used a room and a DM in one session saw two products.
 *
 * These pin the parts that are now shared, because "looks the same" is exactly
 * the property that decays without something asserting it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { DateSeparator } from '../DateSeparator';
import { groupMessagesByDate } from '../formatters';

const SRC = join(process.cwd(), 'src');

describe('the date separator', () => {
  it('names the date to a screen reader without reading the rules around it', () => {
    render(<DateSeparator date="Tuesday" />);

    const separator = screen.getByRole('separator', { name: 'Tuesday' });
    expect(separator).toHaveTextContent('Tuesday');
  });
});

describe('both chat surfaces', () => {
  it('use the same separator component', () => {
    // Not a copy each. The group view had its own inline markup, which is how
    // the P2P one came to have none at all.
    for (const file of ['components/chat/GroupChatView.tsx', 'components/p2p/P2PMessageList.tsx']) {
      const source = readFileSync(join(SRC, file), 'utf-8');
      expect(source, `${file} should render the shared DateSeparator`).toContain('<DateSeparator');
    }
  });

  it('use the same received-bubble surface', () => {
    const group = readFileSync(join(SRC, 'components/chat/GroupMessageItem.tsx'), 'utf-8');
    const p2p = readFileSync(join(SRC, 'components/p2p/bubbles/types.ts'), 'utf-8');

    // `bg-muted` in one and `bg-surface` in the other is what the drift looked
    // like. P2P's is the one with a documented contrast reason behind it.
    expect(group).toContain('bg-surface text-foreground');
    expect(p2p).toContain('bg-surface text-foreground');
    expect(group).not.toContain("'bg-muted text-foreground'");
  });

  it('group messages by date with one shared rule', () => {
    const sameDay = groupMessagesByDate([
      { timestamp: 1700000000000 },
      { timestamp: 1700000001000 },
    ]);
    expect(Object.keys(sameDay)).toHaveLength(1);

    const twoDays = groupMessagesByDate([
      { timestamp: 1700000000000 },
      { timestamp: 1700000000000 + 86_400_000 * 2 },
    ]);
    expect(Object.keys(twoDays)).toHaveLength(2);
  });
});
