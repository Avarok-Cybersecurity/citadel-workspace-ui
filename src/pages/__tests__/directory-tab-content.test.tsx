/**
 * What the directory says when a tab has nobody in it.
 *
 * It rendered zero rows and nothing else, and the Online tab is commonly empty
 * — so the most likely first visit to this page was a blank panel. "Nobody is
 * online" and "nobody is here at all" are different facts and the user can act
 * on exactly one of them.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DirectoryTabContent } from '../DirectoryTabContent';
import type { MemberDisplay } from '../MemberListItem';

const member = (id: string, isOnline: boolean): MemberDisplay =>
  ({ id, displayName: `User ${id}`, isOnline }) as MemberDisplay;

const noop = vi.fn();
const handlers = { onSendMessage: noop, onInvite: noop, onSelect: noop };

describe('an empty directory tab', () => {
  it('says nobody is online when the workspace has offline members', () => {
    render(
      <DirectoryTabContent tab="online" members={[]} totalMembers={3} {...handlers} />,
    );

    expect(screen.getByText(/nobody is online/i)).toBeInTheDocument();
    expect(screen.getByText(/currently offline/i)).toBeInTheDocument();
  });

  it('distinguishes an empty workspace from an all-offline one', () => {
    render(
      <DirectoryTabContent tab="online" members={[]} totalMembers={0} {...handlers} />,
    );

    // Telling a lone user "everyone is offline" would be a lie about people
    // who do not exist, and points them at waiting instead of inviting.
    expect(screen.queryByText(/currently offline/i)).not.toBeInTheDocument();
    expect(screen.getByText(/nobody in this workspace yet/i)).toBeInTheDocument();
  });

  it('tells a user with no members what to do about it', () => {
    render(<DirectoryTabContent tab="all" members={[]} totalMembers={0} {...handlers} />);

    expect(screen.getByText(/no members yet/i)).toBeInTheDocument();
    expect(screen.getByText(/invite someone/i)).toBeInTheDocument();
  });

  it('renders the members and no empty state when there are any', () => {
    render(
      <DirectoryTabContent
        tab="all"
        members={[member('1', true), member('2', false)]}
        totalMembers={2}
        {...handlers}
      />,
    );

    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('User 2')).toBeInTheDocument();
    expect(screen.queryByText(/no members yet/i)).not.toBeInTheDocument();
  });
});
