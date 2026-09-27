/**
 * A Markdown group message is rendered as Markdown, a text one as it was written; and a group's
 * composer offers Text and Markdown but not yet Live Doc.
 *
 * No mocks: the item and the type bar render into jsdom.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GroupMessage } from '@/types/workspace-entities';
import { GroupMessageItem } from '../GroupMessageItem';
import { TypeSelectorBar } from '@/components/p2p/TypeSelectorBar';
import { GROUP_COMPOSE_TYPES } from '../group-compose-types';

const message = (message_type: GroupMessage['message_type'], content: string): GroupMessage => ({
  id: 'm1', group_id: 'g1', sender_id: 'ada', sender_name: 'Ada', message_type, content,
  timestamp: 1n, reply_to: null, reply_count: 0, mentions: [], edited_at: null,
}) as GroupMessage;

function renderItem(m: GroupMessage): void {
  render(
    <GroupMessageItem
      message={m}
      currentUserName="thomas"
      totalMembers={2}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      canRevise={false}
      onReply={vi.fn()}
      focusComposer={vi.fn()}
      quoted={null}
    />,
  );
}

describe('a group message', () => {
  it('renders Markdown as Markdown', () => {
    renderItem(message('Markdown', 'a **bold** word'));
    expect(screen.getByTestId('group-message-markdown').querySelector('strong')?.textContent).toBe('bold');
  });

  it('shows text exactly as written', () => {
    renderItem(message('Text', 'a **bold** word'));
    expect(screen.getByText('a **bold** word')).toBeTruthy();
    expect(screen.queryByTestId('group-message-markdown')).toBeNull();
  });
});

describe("a group's composer", () => {
  it('offers Text and Markdown, and not Live Doc until groups can carry one', () => {
    render(<TypeSelectorBar types={GROUP_COMPOSE_TYPES} selectedType="text" onTypeChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /markdown/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /live doc/i })).toBeNull();
  });
});
