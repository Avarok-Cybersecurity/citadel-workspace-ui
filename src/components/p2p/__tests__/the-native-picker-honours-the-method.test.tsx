/**
 * The agent's native picker is offered only for the method it can carry out.
 *
 * It hands the agent a path on disk and always started a P2P stream: sendFileWithNativePicker
 * hardcodes mode 'p2p'. With "Send File" (a copy saved into their storage) selected,
 * Browse Files silently did the other thing.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileDropZone } from '../FileDropZone';
import { nativePickerBlockedReason } from '../native-picker-reason';

const noop = (): void => {};

function zone(reason: string | null): void {
  render(
    <FileDropZone selectedFile={null} previewUrl={null} isDragging={false} isSending={false} isPickingFile={false}
      nativePickerAvailable={null} nativePickerBlockedReason={reason} maxFileSizeBytes={1024} formatBytes={String}
      onDrop={noop} onDragOver={noop} onDragLeave={noop} onBrowseClick={noop} onNativePickerClick={noop} onRemoveFile={noop} />,
  );
}

describe('the native file picker', () => {
  it('is blocked, with the reason, when the method is Send File', () => {
    const reason: string | null = nativePickerBlockedReason('async');
    expect(reason).toMatch(/P2P Only Transfer/);
    zone(reason);
    const button: HTMLElement = screen.getByRole('button', { name: /Browse Files/ });
    expect(button).toBeDisabled();
    expect(button.textContent).toContain(reason ?? '');
  });

  it('is offered for P2P Only Transfer, which is what it does', () => {
    expect(nativePickerBlockedReason('p2p')).toBeNull();
    zone(null);
    expect(screen.getByRole('button', { name: /Browse Files/ })).toBeEnabled();
  });
});
