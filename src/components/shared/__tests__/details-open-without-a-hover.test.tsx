/**
 * The delivery tick and the "?" beside a field held their words in a hover tooltip: a touch user
 * could not open them and a keyboard user could not focus them. Both are buttons now, named for what
 * they explain, and open on a press: the tick's details open in the message, the field's help in a
 * popover.
 *
 * No mocks: Radix Popover is the production one.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BubbleFooter } from '@/components/p2p/bubbles/BubbleFooter';
import { GroupMessageFooter } from '@/components/chat/GroupMessageFooter';
import { SecurityModeSelect } from '@/components/security/SecurityModeSelect';
import type { P2PMessage } from '@/lib/p2p';
import type { GroupMessage } from '@/types/workspace-entities';

describe('details that used to wait for a hover', () => {
  it('a sent P2P message names its status and opens its details on a press', async () => {
    const message: P2PMessage = { id: 'm1', content: 'hi', senderCid: 1n, recipientCid: 2n, timestamp: 1, status: 'delivered' } as unknown as P2PMessage;
    render(<BubbleFooter message={message} isOwn />);
    const tick: HTMLElement = screen.getByRole('button', { name: 'Delivered to peer. Show details' });
    expect(tick.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(tick);
    expect(await screen.findByTestId('message-status-details')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delivered to peer. Hide details' }).getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(tick);
    expect(screen.queryByTestId('message-status-details')).toBeNull();
  });

  it('a group message names who has seen it and opens the list on a press', async () => {
    const message: GroupMessage = { id: 'g1', content: 'hi', timestamp: 1, read_by: [{ user_id: 'u', user_name: 'Ada', read_at: 1 }] } as unknown as GroupMessage;
    render(<GroupMessageFooter message={message} isOwn totalMembers={4} />);
    await userEvent.click(screen.getByRole('button', { name: 'Seen by some members. Show details' }));
    expect(await screen.findByText(/Seen by 1 of 3/)).toBeTruthy();
  });

  it('a field names its help and opens it on a press', async () => {
    render(<SecurityModeSelect />);
    await userEvent.click(screen.getByRole('button', { name: 'About Security Mode' }));
    expect(await screen.findByText(/preferred security mode/)).toBeTruthy();
  });
});
