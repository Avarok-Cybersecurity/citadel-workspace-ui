/**
 * CollaboratorCursor - Custom cursor render function for Tiptap CollaborationCursor
 *
 * Renders:
 * 1. A thin blinking vertical line at the exact cursor position
 * 2. A glass name tag -- avatar and name -- above that line, never over the text
 * 3. Flash comment functionality (click the tag to expand)
 */

import { eventEmitter } from '@/lib/event-emitter';
import { usernameAvatarColor } from '@/lib/avatar-color';
import type { CursorUser, FlashComment } from './collaborator-cursor-helpers';
import { hexToRgba, generateFlashCommentId } from './collaborator-cursor-helpers';
import { placeCursorTag, TAG_GAP_PX, TAG_EDGE_MARGIN_PX, type Box } from './cursor-tag-placement';
import { registerAvatarSlot } from './cursor-avatar-slots';
import { buildFlashInput } from './cursor-flash-input';

// Re-export types for backward compatibility
export type { CursorUser, FlashComment } from './collaborator-cursor-helpers';

/** Marks the scrolling editor area a tag must stay inside; see CollaborativeEditor. */
export const CURSOR_BOUNDS_ATTRIBUTE: 'data-cursor-bounds' = 'data-cursor-bounds';

function viewportBox(): Box {
  return { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
}

/**
 * Creates the DOM element for a collaborator's cursor
 * Used by Tiptap's CollaborationCursor extension
 */
export function createCollaboratorCursor(user: CursorUser): HTMLElement {
  // The colour is derived from the name, not taken from the peer: one person is
  // one colour everywhere, and a peer-supplied string never reaches a style.
  const color: string = usernameAvatarColor(user.name);

  const cursor: HTMLSpanElement = document.createElement('span');
  cursor.className = 'collaborator-cursor';
  cursor.setAttribute('data-user', user.name);
  cursor.style.setProperty('--cursor-color', color);

  const line: HTMLSpanElement = document.createElement('span');
  line.className = 'collaborator-cursor__line';
  line.style.backgroundColor = color;
  cursor.appendChild(line);

  const tooltip: HTMLDivElement = document.createElement('div');
  tooltip.className = 'collaborator-cursor__tooltip';
  tooltip.setAttribute('data-expanded', 'false');
  tooltip.setAttribute('data-side', 'above');

  // A real button: the tag is the way into the flash-comment composer, so it must be
  // reachable and operable from the keyboard, and say whether the composer is open.
  const label: HTMLButtonElement = document.createElement('button');
  label.type = 'button';
  label.className = 'collaborator-cursor__label';
  label.setAttribute('aria-expanded', 'false');
  label.setAttribute('aria-label', `Flash comment to ${user.name}`);
  const avatarSlot: HTMLSpanElement = document.createElement('span');
  avatarSlot.className = 'collaborator-cursor__avatar';
  avatarSlot.setAttribute('aria-hidden', 'true');
  const nameEl: HTMLSpanElement = document.createElement('span');
  nameEl.className = 'collaborator-cursor__name';
  nameEl.textContent = user.name;
  nameEl.title = user.name;
  label.append(avatarSlot, nameEl);
  tooltip.appendChild(label);

  // The tag lives inside the ProseMirror DOM, so its keystrokes would otherwise reach
  // the editor: Enter on the focused tag split a paragraph in the shared document.
  for (const type of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input'] as const) {
    tooltip.addEventListener(type, (e: Event) => e.stopPropagation());
  }

  const unregisterAvatar: () => void = registerAvatarSlot(avatarSlot, user.name);

  let rafId: number | null = null;

  const updateTooltipPosition = (): void => {
    rafId = null;
    const lineRect: DOMRect = line.getBoundingClientRect();
    const bounds: Box = cursor.closest(`[${CURSOR_BOUNDS_ATTRIBUTE}]`)?.getBoundingClientRect() ?? viewportBox();
    // A caret scrolled out of the editor takes its tag with it.
    tooltip.style.visibility = lineRect.bottom < bounds.top || lineRect.top > bounds.bottom ? 'hidden' : 'visible';
    const placed: ReturnType<typeof placeCursorTag> = placeCursorTag(
      lineRect,
      { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
      bounds,
      TAG_GAP_PX,
      TAG_EDGE_MARGIN_PX,
    );
    tooltip.style.left = `${placed.left}px`;
    tooltip.style.top = `${placed.top}px`;
    tooltip.setAttribute('data-side', placed.side);
  };

  const schedulePositionUpdate = (): void => {
    if (rafId === null) {
      rafId = requestAnimationFrame(updateTooltipPosition);
    }
  };

  setTimeout(updateTooltipPosition, 0);

  // A remote caret moves by ProseMirror editing the document DOM, which fires no
  // scroll or resize; without this the tag stays where the caret used to be.
  let moveObserver: MutationObserver | null = null;
  setTimeout(() => {
    const root: Element | null = cursor.closest('.ProseMirror');
    if (!root) return;
    moveObserver = new MutationObserver(schedulePositionUpdate);
    moveObserver.observe(root, { childList: true, subtree: true, characterData: true });
  }, 0);

  const scrollHandler = (): void => schedulePositionUpdate();
  document.addEventListener('scroll', scrollHandler, true);

  const resizeHandler = (): void => schedulePositionUpdate();
  window.addEventListener('resize', resizeHandler);

  const checkRemoval: () => boolean = () => {
    if (!document.contains(cursor)) {
      document.removeEventListener('scroll', scrollHandler, true);
      window.removeEventListener('resize', resizeHandler);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      moveObserver?.disconnect();
      unregisterAvatar();
      return true;
    }
    return false;
  };

  const cleanupInterval: NodeJS.Timeout = setInterval((): void => {
    if (checkRemoval()) {
      clearInterval(cleanupInterval);
    }
  }, 1000);

  let inputContainer: HTMLElement | null = null;

  const collapse = (): void => {
    inputContainer?.remove();
    inputContainer = null;
    label.hidden = false;
    label.setAttribute('aria-expanded', 'false');
    tooltip.setAttribute('data-expanded', 'false');
    schedulePositionUpdate();
  };

  tooltip.addEventListener('click', (e) => {
    e.stopPropagation();
    // Clicks inside the composer are for the composer: collapsing here discarded the draft.
    if (inputContainer?.contains(e.target as Node)) return;
    e.preventDefault();
    if (inputContainer) {
      collapse();
      label.focus();
      return;
    }

    inputContainer = buildFlashInput(user, {
      onCancel: (): void => { collapse(); label.focus(); },
      onSend: (text: string): void => {
        const cursorRect: DOMRect = cursor.getBoundingClientRect();
        const flashComment: FlashComment = {
          id: generateFlashCommentId(),
          userId: user.name,
          userName: user.name,
          userColor: color,
          text,
          position: { top: cursorRect.top, left: cursorRect.left },
          timestamp: Date.now(),
        };
        // Subscriber: useCollaborativeEditor.ts (handleSendFlashComment).
        eventEmitter.emit('flash-comment:send', flashComment);
        collapse();
        label.focus();
      },
    });
    label.hidden = true;
    label.setAttribute('aria-expanded', 'true');
    tooltip.setAttribute('data-expanded', 'true');
    tooltip.appendChild(inputContainer);
    schedulePositionUpdate();
  });

  cursor.appendChild(tooltip);

  return cursor;
}

/**
 * Creates a decoration for selection highlighting
 * Used to show what text other users have selected
 */
export function createSelectionDecoration(user: CursorUser): { class: string; style: string } {
  return {
    class: 'collaborator-selection',
    style: `background-color: ${hexToRgba(user.color, 0.3)};`
  };
}
