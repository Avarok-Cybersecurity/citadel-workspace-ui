/**
 * The flash-comment composer that opens inside a collaborator's name tag.
 * Plain DOM, because the tag is ProseMirror-owned widget DOM (see CollaboratorCursor).
 */

import type { CursorUser } from './collaborator-cursor-helpers';

const MAX_WORDS: 100 = 100;

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter((w) => w.length > 0);
}

export interface FlashInputHandlers {
  /** Called with the trimmed text when it is non-empty and within the word limit. */
  onSend: (text: string) => void;
  onCancel: () => void;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el: HTMLElementTagNameMap[K] = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function buildFlashInput(user: CursorUser, handlers: FlashInputHandlers): HTMLElement {
  const container: HTMLDivElement = element('div', 'collaborator-cursor__input-container');
  container.appendChild(element('div', 'collaborator-cursor__input-header', `Flash Comment to ${user.name}`));

  const input: HTMLTextAreaElement = element('textarea', 'collaborator-cursor__input');
  input.placeholder = 'Type your comment (100 words max)...';
  input.maxLength = 600;
  input.setAttribute('aria-label', `Flash comment to ${user.name}`);
  container.appendChild(input);

  const wordCount: HTMLDivElement = element('div', 'collaborator-cursor__word-count', `0/${MAX_WORDS} words`);
  container.appendChild(wordCount);
  input.addEventListener('input', () => {
    const count: number = wordsOf(input.value).length;
    wordCount.textContent = `${count}/${MAX_WORDS} words`;
    wordCount.toggleAttribute('data-over', count > MAX_WORDS);
  });

  const buttons: HTMLDivElement = element('div', 'collaborator-cursor__buttons');
  const send: HTMLButtonElement = element('button', 'collaborator-cursor__send-btn', 'Send');
  send.type = 'button';
  send.addEventListener('click', (e) => {
    e.stopPropagation();
    const text: string = input.value.trim();
    if (text && wordsOf(text).length <= MAX_WORDS) handlers.onSend(text);
  });
  const cancel: HTMLButtonElement = element('button', 'collaborator-cursor__cancel-btn', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', (e) => { e.stopPropagation(); handlers.onCancel(); });
  buttons.append(send, cancel);
  container.appendChild(buttons);

  // Focus after insertion: the container is not in the document yet.
  setTimeout(() => input.focus(), 10);
  return container;
}
