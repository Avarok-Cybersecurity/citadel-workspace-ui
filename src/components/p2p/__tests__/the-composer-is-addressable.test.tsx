/**
 * The message composer must be findable by something other than its tag.
 *
 * It used to be an `<input>` inside a form, and became a `<Textarea>` — the
 * right change, because an `<input>` flattened pasted newlines while the group
 * composer one screen away handled them correctly.
 *
 * Every spec still looked for `input[placeholder*="message"]`. A textarea is
 * not an input, so that selector has matched nothing since. The warmup messages
 * that the call, group-call and reconnection suites send before doing anything
 * else were never typed, and the failure was reported as
 *
 *   warmup A -> B should be delivered ... Received: false
 *   Both warmup messages failed — ILM channels not established
 *
 * which reads as a P2P protocol fault and sent this investigation at the
 * transport layer twice.
 *
 * Deliberately about the ATTRIBUTE, not the placeholder or the tag: asserting
 * either would reintroduce the thing that broke.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { P2PMessageInput } from '../P2PMessageInput';

describe('the direct-message composer', () => {
  it('carries the handle the specs type into', () => {
    render(
      <P2PMessageInput
        inputMessage=""
        messageType="text"
        showMarkdownPreview={false}
        canSendMessages
        isSending={false}
        onInputChange={vi.fn()}
        onInputFocus={vi.fn()}
        onInputBlur={vi.fn()}
        onSubmit={vi.fn()}
        onFileClick={vi.fn()}
        onFormat={vi.fn()}
        onTogglePreview={vi.fn()}
        onMessageTypeChange={vi.fn()}
      />,
    );

    const composer: HTMLElement = screen.getByTestId('p2p-message-input');
    expect(composer).toBeInTheDocument();
    // A control a spec can type into, whatever element it happens to be.
    expect(composer).toBeEnabled();
  });
});
