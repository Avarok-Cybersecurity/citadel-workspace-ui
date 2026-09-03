/**
 * The sidebar has to say which conversation you are looking at.
 *
 * The tree above it marks the selected node. The conversation list below marked
 * nothing: `GroupConversationRow` has carried an `isActive` prop and the
 * styling for it since it was written, and its only caller never passed one;
 * `PeerListRow` had no such prop at all. So after opening a few conversations
 * over a session, nothing in the sidebar said which one was on screen.
 *
 * A prop that is declared, styled, destructured and never passed is a feature
 * built from one end.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PeerListRow } from '../PeerListRow';
import { SidebarProvider } from '@/components/ui/sidebar';
import { activeConversation, conversationHref, type ActiveConversation } from '../active-conversation';

describe('activeConversation', () => {
  it('reads the peer conversation out of the query', () => {
    const active: ActiveConversation = activeConversation('/workspace', '?showP2P=true&channel=42');
    expect(active).toEqual({ peerCid: '42', groupId: null });
  });

  it('ignores a channel that is not being shown', () => {
    // `channel` is set on paths that are not rendering the P2P view. A row
    // highlighted for a conversation nobody opened is the same lie as none.
    expect(activeConversation('/workspace', '?channel=42')).toEqual({
      peerCid: null,
      groupId: null,
    });
  });

  it('reads the group out of the path, ignoring anything nested under it', () => {
    expect(activeConversation('/groups/abc', '')).toEqual({ peerCid: null, groupId: 'abc' });
    expect(activeConversation('/groups/abc/settings', '')).toEqual({
      peerCid: null,
      groupId: 'abc',
    });
  });

  it('marks nothing on a path with neither', () => {
    expect(activeConversation('/workspace', '')).toEqual({ peerCid: null, groupId: null });
    expect(activeConversation('/groups/', '')).toEqual({ peerCid: null, groupId: null });
  });
});

describe('the link a peer row navigates to', () => {
  it('round-trips through the reader', () => {
    // The two have to agree on three parameter names and were spelled in
    // separate files. One of them changing is a highlight that never matches.
    const href: string = conversationHref('/workspace', '?nodeId=n1', {
      cid: '42',
      username: 'bob',
    });
    const [pathname, search] = href.split('?');
    expect(activeConversation(pathname, `?${search}`).peerCid).toBe('42');
  });

  it('keeps the parameters that were already there', () => {
    expect(conversationHref('/workspace', '?nodeId=n1', { cid: '42', username: 'bob' })).toContain(
      'nodeId=n1',
    );
  });
});

describe('a peer row that is the open conversation', () => {
  function row(isActive: boolean): void {
    render(
      <MemoryRouter>
        <SidebarProvider>
        <PeerListRow
          cid="42"
          username="bob"
          isOnline
          isConnected
          isActive={isActive}
          onClick={(): void => {}}
        />
        </SidebarProvider>
      </MemoryRouter>,
    );
  }

  it('announces itself as the current page, not only by colour', () => {
    // The status dot beside it already carries a text equivalent for this
    // reason; a highlight that exists only as a background is invisible to a
    // screen reader and to anyone who cannot separate these two purples.
    row(true);
    expect(screen.getByTestId('peer-row-bob')).toHaveAttribute('aria-current', 'page');
  });

  it('says nothing when it is not', () => {
    row(false);
    expect(screen.getByTestId('peer-row-bob')).not.toHaveAttribute('aria-current');
  });
});
