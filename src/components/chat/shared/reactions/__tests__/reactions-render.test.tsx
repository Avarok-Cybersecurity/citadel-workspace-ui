/**
 * Reactions as a person meets them: chips with counts under the bubble, their
 * own highlighted, a click that toggles, the reactors' names, and a picker in
 * the message's action menu -- a menu whose trigger is revealed without hover,
 * so the picker is reachable on touch.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactionChips } from '../ReactionChips';
import { TextBubble } from '@/components/p2p/bubbles/TextBubble';
import { GroupMessageItem } from '@/components/chat/GroupMessageItem';
import type { ReactionBinding } from '../reaction-binding';
import type { P2PMessage } from '@/lib/p2p';
import type { GroupMessage } from '@/types/workspace-entities';

const ME: bigint = 1n;
const ALICE: bigint = 2n;
const names = (cid: bigint): string => (cid === ME ? 'You' : 'Alice');

function binding(onReact: (emoji: string) => void = (): void => {}): ReactionBinding {
  return {
    chips: [
      { emoji: '👍', count: 2, mine: true, reactorCids: [ME, ALICE] },
      { emoji: '🎉', count: 1, mine: false, reactorCids: [ALICE] },
    ],
    nameFor: names,
    onReact,
  };
}

const p2pMessage: P2PMessage = { id: 'm1', content: 'hello', senderCid: ALICE, recipientCid: ME, timestamp: 1, index: 0, status: 'delivered', message_type: 'text' };

describe('reaction chips', () => {
  it('show each emoji with its count', () => {
    render(<ReactionChips binding={binding()} isOwn={false} />);
    expect(screen.getAllByTestId('reaction-chip').map((c) => c.textContent)).toEqual(['👍2', '🎉1']);
  });

  it('mark your own as pressed and the others not', () => {
    render(<ReactionChips binding={binding()} isOwn={false} />);
    expect(screen.getAllByTestId('reaction-chip').map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('name who reacted, in the accessible name and the tooltip', async () => {
    render(<ReactionChips binding={binding()} isOwn={false} />);
    const chip: HTMLElement = screen.getByRole('button', { name: 'You and Alice reacted with 👍' });
    await userEvent.hover(chip);
    expect((await screen.findByRole('tooltip')).textContent).toContain('You and Alice reacted with 👍');
  });

  it('toggle that emoji when clicked', async () => {
    const onReact: (emoji: string) => void = vi.fn();
    render(<ReactionChips binding={binding(onReact)} isOwn={false} />);
    await userEvent.click(screen.getByRole('button', { name: /reacted with 🎉/ }));
    expect(onReact).toHaveBeenCalledWith('🎉');
  });

  it('render nothing when there are none', () => {
    const { container } = render(<ReactionChips binding={{ ...binding(), chips: [] }} isOwn={false} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('the picker', () => {
  async function openMenu(): Promise<HTMLElement> {
    await userEvent.click(screen.getByRole('button', { name: /message actions/i }));
    return screen.getByRole('menu');
  }

  it('is in a P2P message menu, and picking reacts', async () => {
    const onReact: (emoji: string) => void = vi.fn();
    render(<TextBubble message={p2pMessage} isOwn={false} quoted={null} onReply={(): void => {}} reactions={binding(onReact)} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'React with 😂' }));
    expect(onReact).toHaveBeenCalledWith('😂');
  });

  it('sits behind a trigger that is revealed without hover', () => {
    render(<TextBubble message={p2pMessage} isOwn={false} quoted={null} reactions={binding()} />);
    // reveal-on-hover hides only where hover exists, and shows on focus; see index.css.
    const wrapper: HTMLElement | null = screen.getByRole('button', { name: /message actions/i }).closest('.reveal-on-hover');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).not.toMatch(/opacity-0/);
  });

  it('is offered in a peer-group message menu when the group carries reactions', async () => {
    const onReact: (emoji: string) => void = vi.fn();
    render(<GroupMessageItem message={groupMessage()} currentUserName="bob" totalMembers={3} onEdit={(): void => {}} onDelete={(): void => {}} canRevise={false} onReply={(): void => {}} focusComposer={(): void => {}} quoted={null} reactions={binding(onReact)} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'React with 👍' }));
    expect(onReact).toHaveBeenCalledWith('👍');
    expect(screen.getAllByTestId('reaction-chip')).toHaveLength(2);
  });

  it('is not offered where the group cannot carry reactions', async () => {
    render(<GroupMessageItem message={groupMessage()} currentUserName="bob" totalMembers={3} onEdit={(): void => {}} onDelete={(): void => {}} canRevise={true} onReply={(): void => {}} focusComposer={(): void => {}} quoted={null} />);
    expect(within(await openMenu()).queryAllByTestId('reaction-pick')).toEqual([]);
  });
});

function groupMessage(): GroupMessage {
  return {
    id: 'g1', group_id: '7:42', sender_id: '7', sender_name: 'ada', message_type: 'Text', content: 'hi',
    timestamp: 1n, reply_to: null, reply_count: 0, mentions: [], edited_at: null,
  };
}
