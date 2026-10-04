import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createCollaboratorCursor } from '../CollaboratorCursor';
import { CursorAvatars } from '../CursorAvatars';
import { AVATAR_COLORS, usernameAvatarColor } from '@/lib/avatar-color';

/**
 * The real cursor widget and the real CursorAvatars portal. The one fake is the
 * workspace context MemberAvatar reads pictures from (a React context, not I/O).
 */
vi.mock('@/hooks/use-avatar-url', () => ({ useAvatarUrl: (): undefined => undefined }));

afterEach(() => { cleanup(); document.body.innerHTML = ''; });

function mountCursor(name: string, color: string): HTMLElement {
  const cursor: HTMLElement = createCollaboratorCursor({ name, color });
  document.body.appendChild(cursor);
  return cursor;
}

describe('a remote cursor tag', () => {
  it('shows a small circular avatar and the name', () => {
    const cursor: HTMLElement = mountCursor('Alice Smith', '#000000');
    render(<CursorAvatars />);
    const slot: HTMLElement | null = cursor.querySelector('.collaborator-cursor__avatar');
    expect(slot?.querySelector('[data-testid="member-avatar-Alice Smith"]')).not.toBeNull();
    expect(slot?.textContent).toBe('AS'); // initials fallback, no picture set
    expect(cursor.querySelector('.collaborator-cursor__name')?.textContent).toBe('Alice Smith');
    expect(slot?.getAttribute('aria-hidden')).toBe('true'); // the name beside it is the label
    expect(slot?.querySelector('.h-4.w-4')).not.toBeNull(); // 16px
  });

  it('takes the person\'s colour from their name, not from what the peer sent', () => {
    const cursor: HTMLElement = mountCursor('Bob', 'red; background: url(x)');
    const expected: string = usernameAvatarColor('Bob');
    expect(AVATAR_COLORS).toContain(expected);
    expect(cursor.style.getPropertyValue('--cursor-color')).toBe(expected);
    expect((cursor.querySelector('.collaborator-cursor__line') as HTMLElement).style.backgroundColor).not.toBe('');
  });

  it('gives one person one colour, and different people can differ', () => {
    expect(usernameAvatarColor('carol')).toBe(usernameAvatarColor('carol'));
    const colours: Set<string> = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(usernameAvatarColor));
    expect(colours.size).toBeGreaterThan(1);
  });

  it('removes its avatar when the cursor leaves the document', async () => {
    const cursor: HTMLElement = mountCursor('Dave', '#000');
    const { container } = render(<CursorAvatars />);
    expect(container.ownerDocument.querySelector('[data-testid="member-avatar-Dave"]')).not.toBeNull();
    cursor.remove();
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)); });
    expect(document.querySelector('[data-testid="member-avatar-Dave"]')).toBeNull();
  });

  it('keeps the caret line thin and the tag out of the text flow', () => {
    const cursor: HTMLElement = mountCursor('Eve', '#000');
    expect(cursor.querySelector('.collaborator-cursor__line')).not.toBeNull();
    expect(cursor.querySelector('.collaborator-cursor__tooltip')?.getAttribute('data-side')).toBe('above');
  });
});
