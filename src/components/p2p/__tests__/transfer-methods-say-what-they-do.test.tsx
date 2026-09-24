/**
 * The file-send dialog describes the methods as they behave.
 *
 * "Send File — Stores on server, recipient downloads when ready" was false:
 * that method pushes the bytes into the recipient's own RE-VFS through their
 * agent (lib/file-transfer/server-upload.ts), so they must be online, and it
 * is capped at the inline-upload limit.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileTransferModal } from '../FileTransferModal';
import { MAX_BYTE_CONTENTS_BYTES } from '@/lib/file-transfer/server-upload';

describe('the transfer method copy', () => {
  it('does not promise a server that holds the file', () => {
    render(<FileTransferModal isOpen onClose={vi.fn()} onSendFile={vi.fn()} peerCid="42" />);

    expect(screen.queryByText(/stores on server/i)).toBeNull();
    const limit: string = `${MAX_BYTE_CONTENTS_BYTES / (1024 * 1024)} MB`;
    expect(screen.getByText(new RegExp(`must be online now\\. Up to ${limit}`))).toBeInTheDocument();
    expect(screen.getByText(/once they accept/)).toBeInTheDocument();
  });
});
