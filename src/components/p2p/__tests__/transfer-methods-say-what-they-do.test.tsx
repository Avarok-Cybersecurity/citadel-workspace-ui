/**
 * The file-send dialog describes the methods as they behave.
 *
 * "Send File — Stores on server, recipient downloads when ready" was false,
 * and so was its replacement, "Saves an encrypted copy into their storage":
 * that copy was a RE-VFS object only the sender could retrieve. The method now
 * sends over the protocol transfer, needs both online, and is capped at the
 * inline-upload limit.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileTransferModal } from '../FileTransferModal';
import { MAX_BYTE_CONTENTS_BYTES } from '@/lib/file-transfer/server-upload';

describe('the transfer method copy', () => {
  it('does not promise a server that holds the file', () => {
    render(<FileTransferModal isOpen onClose={vi.fn()} onSendFile={vi.fn()} peerCid="42" />);

    expect(screen.queryByText(/stores on server/i)).toBeNull();
    expect(screen.queryByText(/into their storage/i)).toBeNull();
    const limit: string = `${MAX_BYTE_CONTENTS_BYTES / (1024 * 1024)} MB`;
    expect(screen.getByText(new RegExp(`both need to be online\\. Up to ${limit}`))).toBeInTheDocument();
    expect(screen.getByText(/once they accept/)).toBeInTheDocument();
  });
});
