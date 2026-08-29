/**
 * A peer's row must be findable by name and must say its own status.
 *
 * `connectP2P` verified a connection by walking into a sidebar section headed
 * "CONNECTED PEERS" and looking for the peer inside it. That heading was
 * deliberately removed: the members list called itself "Workspace Members",
 * "Connected Peers" or "<Entity> Members" depending on state the user could not
 * see, and was given one noun. From that day the locator matched nothing, the
 * check could never pass, and every P2P connection was reported as
 *
 *   FAIL: P2P connect to X sent, but the peer never appeared as connected
 *
 * which reads as a protocol failure and is a heading that changed. It is the
 * only verification that function has.
 *
 * The row's own status text is what the helper reads now — the same string a
 * screen reader is given, so the check and the accessibility affordance stand
 * or fall together.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { PeerListRow } from '../PeerListRow';

function renderRow(isConnected: boolean, isOnline: boolean): void {
  render(
    <SidebarProvider>
      <PeerListRow
        cid="42"
        username="ada"
        isOnline={isOnline}
        isConnected={isConnected}
        onClick={vi.fn()}
      />
    </SidebarProvider>,
  );
}

describe('a peer row', () => {
  it('is addressable by the peer’s name and says Connected', () => {
    renderRow(true, true);

    const row: HTMLElement = screen.getByTestId('peer-row-ada');
    expect(row).toBeInTheDocument();
    expect(row.textContent ?? '').toContain('Connected');
  });

  it('does not say Connected when it is merely online', () => {
    // The positive control. Without it, "the row says Connected" is satisfied
    // by a row that says it unconditionally — and the helper would then report
    // every attempt as a success, which is the mirror of the bug it replaced.
    renderRow(false, true);

    const row: HTMLElement = screen.getByTestId('peer-row-ada');
    expect(row.textContent ?? '').toContain('Online');
    expect(row.textContent ?? '').not.toContain('Connected');
  });

  it('says Offline when it is neither', () => {
    renderRow(false, false);
    expect(screen.getByTestId('peer-row-ada').textContent ?? '').toContain('Offline');
  });
});
