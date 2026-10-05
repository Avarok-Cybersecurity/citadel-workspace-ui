/**
 * There is one way to send a file: the Citadel protocol. The dialog used to
 * offer "Send File (Recommended)" and "P2P Only Transfer", two names for what
 * became one mechanism, and the chat settings a third choice nothing read.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileTransferModal } from '../FileTransferModal';
import { MAX_BYTE_CONTENTS_BYTES } from '@/lib/file-transfer/server-upload';

describe('the send dialog', () => {
  it('offers no transfer method, one Send, and the real size ceiling', () => {
    render(<FileTransferModal isOpen onClose={vi.fn()} onSendFile={vi.fn()} peerCid="42" />);

    expect(screen.queryByText(/transfer method/i)).toBeNull();
    expect(screen.queryByText(/P2P Only/i)).toBeNull();
    expect(screen.queryByText(/Recommended/i)).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Send$/ })).toHaveLength(1);
    const limit: string = `${MAX_BYTE_CONTENTS_BYTES / (1024 * 1024)} MB`;
    expect(screen.getByText(new RegExp(`Maximum size: ${limit}`))).toBeInTheDocument();
  });
});

describe('Send to their storage', () => {
  it('is a separate action, offered only once a file is chosen', () => {
    render(<FileTransferModal isOpen onClose={vi.fn()} onSendFile={vi.fn()} peerCid="42" />);
    const action: HTMLElement = screen.getByTestId('send-to-their-storage');
    expect(action).toHaveTextContent('Send to their storage');
    expect(action).toBeDisabled();
  });
});
