/**
 * "Is this my message" must compare like with like.
 *
 * The server sets `sender_id` from `get_username_by_cid` — a workspace USERNAME.
 * The client compared it against `String(connectionInfo.cid)`, a decimal CID.
 * Those can never be equal, so `isOwnMessage` was ALWAYS false: the Edit and
 * Delete menu items are gated on it and never rendered for anyone, and your own
 * messages rendered left-aligned as if someone else had sent them.
 *
 * The server would have accepted the edits — its own permission check compares
 * `msg.sender_id != actor_user_id`, username to username. Only the UI affordance
 * was dead.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupMessageItem } from '../GroupMessageItem';

const ALICE: "alice_citadel" = 'alice_citadel';

function message(senderId: string): never {
  return {
    id: 'm1',
    group_id: 'g1',
    sender_id: senderId,
    sender_name: senderId,
    content: 'hello',
    timestamp: 1,
    edited: false,
    reply_to: null,
    reply_count: 0,
  } as never;
}

/** The handlers the item needs; none is exercised by these assertions. */
const props: { onEdit: () => void; onDelete: () => void; onReply: () => void; onOpenThread: () => void; totalMembers: number; canRevise: boolean; } = {
  onEdit: (): void => {},
  onDelete: (): void => {},
  onReply: (): void => {},
  onOpenThread: (): void => {},
  totalMembers: 3,
  // A node-backed chat channel, which is what these fixtures model. A peer
  // group cannot revise -- see a-peer-group-offers-only-what-works.
  canRevise: true,
};

describe('a group message', () => {
  /**
   * Open the actions menu and list what it offers. The TRIGGER always renders —
   * Reply is available on every message — so the trigger's presence proves
   * nothing. Edit and Delete are the items gated on `isOwnMessage`.
   */
  async function menuItems(): Promise<string[]> {
    await userEvent.click(screen.getByRole('button', { name: /message actions/i }));
    return screen.getAllByRole('menuitem').map((el) => el.textContent ?? '');
  }

  it('offers Edit and Delete on your OWN message', async () => {
    render(<GroupMessageItem {...props} message={message(ALICE)} currentUserName={ALICE} />);

    const items: string[] = await menuItems();
    expect(items.join(' ')).toMatch(/Edit/);
    expect(items.join(' ')).toMatch(/Delete/);
  });

  it("does not offer them on someone else's message", async () => {
    render(<GroupMessageItem {...props} message={message('bob_citadel')} currentUserName={ALICE} />);

    const items: string[] = await menuItems();
    expect(items.join(' ')).toMatch(/Reply/);
    expect(items.join(' ')).not.toMatch(/Edit|Delete/);
  });

  it('does not treat a user literally named "You" as the reader', async () => {
    // `currentUserName` falls back to the string 'You' when the connection has
    // no username yet. Comparing against that would make every message from a
    // user called "You" look like the reader's own.
    render(<GroupMessageItem {...props} message={message('You')} currentUserName="You" />);

    const items: string[] = await menuItems();
    expect(items.join(' ')).not.toMatch(/Edit|Delete/);
  });
});

describe('a group that cannot revise', () => {
  it('offers neither Edit nor Delete, even on your own message', async () => {
    // The peer wire has no GroupEdit and no GroupDelete. Offering them showed a
    // control whose only outcome was "Permission denied".
    render(<GroupMessageItem {...props} canRevise={false} message={message(ALICE)} currentUserName={ALICE} />);

    await userEvent.click(screen.getByRole('button', { name: /message actions/i }));
    const items: string[] = screen.getAllByRole('menuitem').map((el) => el.textContent ?? '');
    expect(items.join(' ')).not.toMatch(/Edit/);
    expect(items.join(' ')).not.toMatch(/Delete/);
    // Reply survives: the peer envelope carries reply_to.
    expect(items.join(' ')).toMatch(/Reply/);
  });
});
