import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { createCollaboratorCursor } from '../CollaboratorCursor';
import { CursorAvatars } from '../CursorAvatars';
import { avatarSlotsSnapshot } from '../cursor-avatar-slots';
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
    expect(slot?.textContent).toBe('A'); // one initial: two do not fit 16px at a legible size
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

  it('releases its avatar slot when the cursor leaves the document', async () => {
    // Counted by name: the registry is module-wide and earlier tests' cursors release theirs on their own timers.
    const slotsFor = (name: string): number => avatarSlotsSnapshot().filter((s) => s.name === name).length;
    const cursor: HTMLElement = mountCursor('Dave', '#000');
    render(<CursorAvatars />);
    expect(slotsFor('Dave')).toBe(1);
    cursor.remove();
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)); });
    expect(slotsFor('Dave')).toBe(0);
  });

  it('keeps the caret line thin and the tag out of the text flow', () => {
    const cursor: HTMLElement = mountCursor('Eve', '#000');
    expect(cursor.querySelector('.collaborator-cursor__line')).not.toBeNull();
    expect(cursor.querySelector('.collaborator-cursor__tooltip')?.getAttribute('data-side')).toBe('above');
  });

  it('opens the flash-comment composer from the keyboard and closes it with Escape', async () => {
    const cursor: HTMLElement = mountCursor('Frank', '#000');
    const label: HTMLButtonElement = cursor.querySelector('button.collaborator-cursor__label') as HTMLButtonElement;
    expect(label.getAttribute('aria-expanded')).toBe('false');
    label.click(); // what Enter or Space on a button does
    expect(label.getAttribute('aria-expanded')).toBe('true');
    const input: HTMLTextAreaElement = cursor.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(cursor.querySelector('textarea')).toBeNull();
    expect(label.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(label);
  });

  it('keeps a half-written comment when the person clicks into the box', () => {
    const cursor: HTMLElement = mountCursor('Gail', '#000');
    (cursor.querySelector('button.collaborator-cursor__label') as HTMLButtonElement).click();
    const input: HTMLTextAreaElement = cursor.querySelector('textarea') as HTMLTextAreaElement;
    input.value = 'draft';
    fireEvent.click(input);
    expect(cursor.querySelector('textarea')?.value).toBe('draft');
  });

  it('keeps its keystrokes away from the editor that contains it', () => {
    const cursor: HTMLElement = mountCursor('Hana', '#000');
    const reached: string[] = [];
    document.body.addEventListener('keydown', (e) => reached.push(e.key));
    const label: HTMLButtonElement = cursor.querySelector('button.collaborator-cursor__label') as HTMLButtonElement;
    fireEvent.keyDown(label, { key: 'Enter' });
    expect(reached).toEqual([]);
  });
});
