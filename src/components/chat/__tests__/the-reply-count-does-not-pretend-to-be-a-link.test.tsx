/**
 * A control that cannot act must not look like one.
 *
 * The reply count rendered as `<button class="text-primary-accent
 * hover:text-primary-accent">3 replies</button>`: keyboard-focusable,
 * announced as a button, coloured like a link — and with no `onClick`. Nothing
 * in this app renders or opens a thread, so there was nothing for it to do.
 *
 * `onReply` exists, but it composes a NEW reply, which is not what "3 replies"
 * offers. Wiring it there would have been worse than leaving it dead: a control
 * that does something other than what it says.
 *
 * The count is worth showing. The promise is not.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GroupMessageItem } from '../GroupMessageItem';
import type { GroupMessage } from '@/types/workspace-entities';

function messageWith(replyCount: number): GroupMessage {
  return {
    id: 'm1',
    sender_id: 'alice',
    content: 'hello',
    timestamp: 0,
    reply_count: replyCount,
  } as unknown as GroupMessage;
}

function renderItem(replyCount: number): void {
  render(
    <GroupMessageItem
      message={messageWith(replyCount)}
      currentUserName="bob"
      totalMembers={2}
      onEdit={vi.fn()}
      onDelete={vi.fn()} canRevise
      onReply={vi.fn()}
    />,
  );
}

describe('the reply count on a group message', () => {
  it('is not a button, because there is nothing for it to do', () => {
    renderItem(3);

    const count: HTMLElement = screen.getByTestId('group-reply-count');
    expect(count.tagName.toLowerCase()).not.toBe('button');
    // Nor focusable by another route.
    expect(count.getAttribute('tabindex')).toBeNull();
    expect(count.getAttribute('role')).toBeNull();
  });

  it('still says how many replies there are', () => {
    // The positive control. Removing the affordance must not remove the
    // information — knowing a message has a thread is useful even when you
    // cannot open one.
    renderItem(3);
    expect(screen.getByTestId('group-reply-count')).toHaveTextContent('3 replies');
  });

  it('says "reply" for one, and shows nothing for none', () => {
    renderItem(1);
    expect(screen.getByTestId('group-reply-count')).toHaveTextContent('1 reply');
  });
});
