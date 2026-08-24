/**
 * Layout regression: the call buttons drifted into the MIDDLE of the header.
 *
 * The row is `justify-between`, which distributes its direct children. With
 * identity, call buttons and settings as three siblings, the buttons landed
 * centred — visibly wrong, and worse the shorter the peer's name was. They have
 * to sit in one right-hand group with settings so the row has exactly two
 * children to separate.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { P2PChatHeader } from '../P2PChatHeader';
import { MessagingLayerType } from '@/types/messaging-layer';
import type { PeerPresence } from '@/lib/p2p';

const ONLINE: PeerPresence = { status: MessagingLayerType.Online, lastUpdate: 0 };

const callProps = {
  canCall: true,
  inCall: false,
  capability: { supported: true },
  onStartCall: vi.fn(),
  onLeave: vi.fn(),
};

function renderHeader() {
  return render(
    <P2PChatHeader
      peerName="Alice Chen"
      peerPresence={ONLINE}
      peerTyping={false}
      isConnected
      isRegistered
      onSettingsClick={vi.fn()}
      call={callProps}
    />,
  );
}

describe('P2PChatHeader layout', () => {
  it('keeps the call buttons in the same group as settings', () => {
    renderHeader();

    const audio = screen.getByTestId('call-start-audio');
    const settings = screen.getByTestId('chat-settings-button');

    // Sharing an ancestor that is NOT the justify-between row is what puts them
    // together on the right rather than spread across the header.
    expect(audio.closest('div')?.parentElement).toBe(settings.parentElement);
  });

  it('leaves the justify-between row exactly two children to separate', () => {
    const { container } = renderHeader();
    const row = container.querySelector('.justify-between');

    expect(row).not.toBeNull();
    expect(row?.children).toHaveLength(2);
  });

  it('truncates a long peer name instead of pushing the actions off screen', () => {
    renderHeader();

    expect(screen.getByRole('heading', { name: 'Alice Chen' }).className).toContain('truncate');
  });
});
