/**
 * CollaboratorCursor - Custom cursor render function for Tiptap CollaborationCursor
 *
 * Renders:
 * 1. A thin blinking vertical line at the exact cursor position
 * 2. A tooltip with the user's name above the cursor
 * 3. Flash comment functionality (click tooltip to expand)
 */

import { eventEmitter } from '@/lib/event-emitter';
import type { CursorUser, FlashComment } from './collaborator-cursor-helpers';
import { hexToRgba, generateFlashCommentId } from './collaborator-cursor-helpers';

// Re-export types for backward compatibility
export type { CursorUser, FlashComment } from './collaborator-cursor-helpers';

/**
 * Creates the DOM element for a collaborator's cursor
 * Used by Tiptap's CollaborationCursor extension
 */
export function createCollaboratorCursor(user: CursorUser): HTMLElement {
  const cursor = document.createElement('span');
  cursor.className = 'collaborator-cursor';
  cursor.setAttribute('data-user', user.name);
  cursor.style.setProperty('--cursor-color', user.color);

  const line = document.createElement('span');
  line.className = 'collaborator-cursor__line';
  line.style.backgroundColor = user.color;
  cursor.appendChild(line);

  const tooltip: HTMLDivElement = document.createElement('div');
  tooltip.className = 'collaborator-cursor__tooltip';
  tooltip.style.backgroundColor = hexToRgba(user.color, 0.9);
  tooltip.textContent = user.name;
  tooltip.setAttribute('data-expanded', 'false');

  let lastLeft: number = 0;
  let lastTop: number = 0;
  let rafId: number | null = null;

  const updateTooltipPosition = (): void => {
    rafId = null;
    const cursorRect: DOMRect = cursor.getBoundingClientRect();
    const newLeft: number = cursorRect.left;
    const newTop: number = cursorRect.top - tooltip.offsetHeight - 4;

    if (newLeft !== lastLeft || newTop !== lastTop) {
      lastLeft = newLeft;
      lastTop = newTop;
      tooltip.style.left = `${newLeft}px`;
      tooltip.style.top = `${newTop}px`;
    }
  };

  const schedulePositionUpdate = (): void => {
    if (rafId === null) {
      rafId = requestAnimationFrame(updateTooltipPosition);
    }
  };

  setTimeout(updateTooltipPosition, 0);

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
      return true;
    }
    return false;
  };

  const cleanupInterval: NodeJS.Timeout = setInterval((): void => {
    if (checkRemoval()) {
      clearInterval(cleanupInterval);
    }
  }, 1000);

  let inputShown: boolean = false;
  let inputContainer: HTMLElement | null = null;

  tooltip.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (inputShown) {
      if (inputContainer) {
        inputContainer.remove();
        inputContainer = null;
      }
      tooltip.setAttribute('data-expanded', 'false');
      tooltip.textContent = user.name;
      inputShown = false;
    } else {
      tooltip.setAttribute('data-expanded', 'true');
      tooltip.textContent = '';

      inputContainer = document.createElement('div');
      inputContainer.className = 'collaborator-cursor__input-container';

      const header: HTMLDivElement = document.createElement('div');
      header.className = 'collaborator-cursor__input-header';
      header.textContent = `Flash Comment to ${user.name}`;
      inputContainer.appendChild(header);

      const input: HTMLTextAreaElement = document.createElement('textarea');
      input.className = 'collaborator-cursor__input';
      input.placeholder = 'Type your comment (100 words max)...';
      input.maxLength = 600;
      inputContainer.appendChild(input);

      const wordCount: HTMLDivElement = document.createElement('div');
      wordCount.className = 'collaborator-cursor__word-count';
      wordCount.textContent = '0/100 words';
      inputContainer.appendChild(wordCount);

      input.addEventListener('input', () => {
        const words: string[] = input.value.trim().split(/\s+/).filter(w => w.length > 0);
        const count: number = words.length;
        wordCount.textContent = `${count}/100 words`;
        wordCount.style.color = count > 100 ? '#ef4444' : '#9ca3af';
      });

      const buttons: HTMLDivElement = document.createElement('div');
      buttons.className = 'collaborator-cursor__buttons';

      const sendBtn: HTMLButtonElement = document.createElement('button');
      sendBtn.className = 'collaborator-cursor__send-btn';
      sendBtn.textContent = 'Send';
      sendBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text: string = input.value.trim();
        const words: string[] = text.split(/\s+/).filter(w => w.length > 0);

        if (text && words.length <= 100) {
          const cursorRect: DOMRect = cursor.getBoundingClientRect();

          const flashComment: FlashComment = {
            id: generateFlashCommentId(),
            userId: user.name,
            userName: user.name,
            userColor: user.color,
            text,
            position: {
              top: cursorRect.top,
              left: cursorRect.left,
            },
            timestamp: Date.now(),
          };

          // Subscriber: useCollaborativeEditor.ts:161 (handleSendFlashComment).
          eventEmitter.emit('flash-comment:send', flashComment);

          if (inputContainer) {
            inputContainer.remove();
            inputContainer = null;
          }
          tooltip.setAttribute('data-expanded', 'false');
          tooltip.textContent = user.name;
          inputShown = false;
        }
      });
      buttons.appendChild(sendBtn);

      const cancelBtn: HTMLButtonElement = document.createElement('button');
      cancelBtn.className = 'collaborator-cursor__cancel-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (inputContainer) {
          inputContainer.remove();
          inputContainer = null;
        }
        tooltip.setAttribute('data-expanded', 'false');
        tooltip.textContent = user.name;
        inputShown = false;
      });
      buttons.appendChild(cancelBtn);

      inputContainer.appendChild(buttons);
      tooltip.appendChild(inputContainer);

      setTimeout(() => input.focus(), 10);
      inputShown = true;
    }
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
