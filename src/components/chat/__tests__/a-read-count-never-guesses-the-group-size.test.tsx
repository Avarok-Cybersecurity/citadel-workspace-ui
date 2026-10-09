/**
 * "N members haven't seen this" and "Seen by X of Y" were computed from a member
 * total that defaulted to 2 when a caller omitted it (the office channel did), so
 * a channel of forty said everyone had seen a message once one person had. An
 * unknown total renders no count at all.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadByTooltipContent, getReadStatus } from '../GroupMessageFooter';
import type { GroupMessage, GroupMessageReadBy } from '@/types/workspace-entities';

const readers: GroupMessageReadBy[] = [{ user_id: 'u1', user_name: 'Una', read_at: 1 }];
const message: GroupMessage = { id: "m", read_by: readers } as unknown as GroupMessage;

describe('a group message read receipt', () => {
  it('counts against the real member total', () => {
    expect(getReadStatus(message, 4)).toBe('partial');
    render(<ReadByTooltipContent readBy={readers} totalMembers={4} status="partial" />);
    expect(screen.getByText('Seen by 1 of 3')).toBeInTheDocument();
    expect(screen.getByText(/2 members haven't seen this yet/)).toBeInTheDocument();
  });

  it('says who has seen it, with no count, when the total is unknown', () => {
    expect(getReadStatus(message, null)).toBe('partial');
    render(<ReadByTooltipContent readBy={readers} totalMembers={null} status="partial" />);
    expect(screen.getByText('Una')).toBeInTheDocument();
    expect(screen.queryByText(/Seen by 1 of/)).toBeNull();
    expect(screen.queryByText(/haven't seen/)).toBeNull();
  });

  it('never calls a message read by everyone without knowing everyone', () => {
    expect(getReadStatus(message, null)).not.toBe('all_read');
  });
});
