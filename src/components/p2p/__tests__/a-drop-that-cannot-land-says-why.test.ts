/** A drop that cannot land says why; it is never silent. */
import { describe, it, expect } from 'vitest';
import { dropUnavailableReason } from '../drop-unavailable';
import { PAUSE_COPY } from '@/lib/p2p-pause/pause-copy';

describe('dropUnavailableReason', () => {
  it('points a document view at the Messages tab', () => {
    expect(dropUnavailableReason({ viewingDocument: true, paused: false })).toBe('Drop files on the Messages tab to send them.');
  });
  it('gives the paused reason the paperclip gives', () => {
    expect(dropUnavailableReason({ viewingDocument: false, paused: true })).toBe(PAUSE_COPY.fileReason);
  });
  it('is null when a file can land', () => {
    expect(dropUnavailableReason({ viewingDocument: false, paused: false })).toBeNull();
  });
});
