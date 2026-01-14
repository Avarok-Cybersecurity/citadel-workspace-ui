/**
 * CollaboratorCursor - Custom cursor render function for Tiptap CollaborationCursor
 *
 * Renders:
 * 1. A thin blinking vertical line at the exact cursor position
 * 2. A tooltip with the user's name above the cursor
 * 3. Flash comment functionality (click tooltip to expand)
 */

import { eventEmitter } from '@/lib/event-emitter';

export interface CursorUser {
  name: string;
  color: string;
}

export interface FlashComment {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  position: { top: number; left: number };
  timestamp: number;
}

// Parse hex color to RGB for transparency
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

// Generate unique ID for flash comments
function generateFlashCommentId(): string {
  return `flash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates the DOM element for a collaborator's cursor
 * Used by Tiptap's CollaborationCursor extension
 */
export function createCollaboratorCursor(user: CursorUser): HTMLElement {
  // Main container - positioned inline within text
  const cursor = document.createElement('span');
  cursor.className = 'collaborator-cursor';
  cursor.setAttribute('data-user', user.name);
  cursor.style.setProperty('--cursor-color', user.color);

  // Vertical line element (the actual cursor indicator)
  const line = document.createElement('span');
  line.className = 'collaborator-cursor__line';
  line.style.backgroundColor = user.color;
  cursor.appendChild(line);

  // Tooltip with username - uses fixed positioning to escape overflow containers
  const tooltip = document.createElement('div');
  tooltip.className = 'collaborator-cursor__tooltip';
  tooltip.style.backgroundColor = hexToRgba(user.color, 0.9);
  tooltip.textContent = user.name;
  tooltip.setAttribute('data-expanded', 'false');

  // Track last known position to avoid unnecessary updates
  let lastLeft = 0;
  let lastTop = 0;
  let rafId: number | null = null;

  // Function to update tooltip position based on cursor's viewport position
  const updateTooltipPosition = () => {
    rafId = null;
    const cursorRect = cursor.getBoundingClientRect();
    const newLeft = cursorRect.left;
    const newTop = cursorRect.top - tooltip.offsetHeight - 4;

    // Only update if position actually changed (reduces reflows)
    if (newLeft !== lastLeft || newTop !== lastTop) {
      lastLeft = newLeft;
      lastTop = newTop;
      tooltip.style.left = `${newLeft}px`;
      tooltip.style.top = `${newTop}px`;
    }
  };

  // Throttled position update - only one RAF at a time
  const schedulePositionUpdate = () => {
    if (rafId === null) {
      rafId = requestAnimationFrame(updateTooltipPosition);
    }
  };

  // Initial position after DOM insertion
  setTimeout(updateTooltipPosition, 0);

  // Update on scroll (capture phase to catch container scrolling)
  const scrollHandler = () => schedulePositionUpdate();
  document.addEventListener('scroll', scrollHandler, true);

  // Update on window resize
  const resizeHandler = () => schedulePositionUpdate();
  window.addEventListener('resize', resizeHandler);

  // Clean up when cursor is removed - use a lightweight check
  const checkRemoval = () => {
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

  // Periodic cleanup check (lightweight alternative to MutationObserver on body)
  const cleanupInterval = setInterval(() => {
    if (checkRemoval()) {
      clearInterval(cleanupInterval);
    }
  }, 1000);

  // Track if input is shown
  let inputShown = false;
  let inputContainer: HTMLElement | null = null;

  // Click handler to expand tooltip for flash comment
  tooltip.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (inputShown) {
      // Collapse
      if (inputContainer) {
        inputContainer.remove();
        inputContainer = null;
      }
      tooltip.setAttribute('data-expanded', 'false');
      tooltip.textContent = user.name;
      inputShown = false;
    } else {
      // Expand to show flash comment input
      tooltip.setAttribute('data-expanded', 'true');
      tooltip.textContent = '';

      // Create input container
      inputContainer = document.createElement('div');
      inputContainer.className = 'collaborator-cursor__input-container';

      // Header with username
      const header = document.createElement('div');
      header.className = 'collaborator-cursor__input-header';
      header.textContent = `Flash Comment to ${user.name}`;
      inputContainer.appendChild(header);

      // Text input
      const input = document.createElement('textarea');
      input.className = 'collaborator-cursor__input';
      input.placeholder = 'Type your comment (100 words max)...';
      input.maxLength = 600; // Approximate 100 words
      inputContainer.appendChild(input);

      // Word count
      const wordCount = document.createElement('div');
      wordCount.className = 'collaborator-cursor__word-count';
      wordCount.textContent = '0/100 words';
      inputContainer.appendChild(wordCount);

      // Update word count on input
      input.addEventListener('input', () => {
        const words = input.value.trim().split(/\s+/).filter(w => w.length > 0);
        const count = words.length;
        wordCount.textContent = `${count}/100 words`;
        wordCount.style.color = count > 100 ? '#ef4444' : '#9ca3af';
      });

      // Button container
      const buttons = document.createElement('div');
      buttons.className = 'collaborator-cursor__buttons';

      // Send button
      const sendBtn = document.createElement('button');
      sendBtn.className = 'collaborator-cursor__send-btn';
      sendBtn.textContent = 'Send';
      sendBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = input.value.trim();
        const words = text.split(/\s+/).filter(w => w.length > 0);

        if (text && words.length <= 100) {
          // Get cursor position for positioning the flash comment
          const cursorRect = cursor.getBoundingClientRect();

          // Emit flash comment event
          const flashComment: FlashComment = {
            id: generateFlashCommentId(),
            userId: user.name, // Using name as ID for now
            userName: user.name,
            userColor: user.color,
            text,
            position: {
              top: cursorRect.top,
              left: cursorRect.left,
            },
            timestamp: Date.now(),
          };

          eventEmitter.emit('flash-comment:send', flashComment);

          // Collapse the input
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

      // Cancel button
      const cancelBtn = document.createElement('button');
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

      // Focus the input
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
