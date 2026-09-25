/**
 * An upload lands in the folder that is open.
 *
 * Live: with "Root / Sent Files" open, "Upload file" stored the file in Root and
 * the open folder went on saying "This folder is empty". The picker's target
 * was its own `useState('/')`, a second copy of the open folder with a default
 * of its own, so any selection that did not follow the exact click-then-set
 * sequence went to Root.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, render, screen } from '@testing-library/react';
import { useUploadTarget, type UploadTarget } from '../useUploadTarget';
import { VFSToolbar } from '../VFSToolbar';
import { uploadRefusal } from '../upload-refusal';

function target(initial: string): { result: { current: UploadTarget }; rerender: (path: string) => void } {
  const { result, rerender } = renderHook((path: string): UploadTarget => useUploadTarget(path), { initialProps: initial });
  return { result, rerender };
}

describe('the upload target', () => {
  it('is the open folder when nothing named another', () => {
    const t: ReturnType<typeof target> = target('/Docs');
    expect(t.result.current.take()).toBe('/Docs');
  });

  it('follows the user into the folder they opened', () => {
    const t: ReturnType<typeof target> = target('/');
    t.rerender('/Docs/Drafts');
    expect(t.result.current.take()).toBe('/Docs/Drafts');
  });

  it('honours a folder named for one pick, once', () => {
    const t: ReturnType<typeof target> = target('/Docs');
    t.result.current.choose('/Docs/Sub');
    expect(t.result.current.take()).toBe('/Docs/Sub');
    expect(t.result.current.take()).toBe('/Docs');
  });

  it('forgets a named folder when the user navigates away', () => {
    const t: ReturnType<typeof target> = target('/Docs');
    t.result.current.choose('/Docs/Sub');
    t.rerender('/Photos');
    expect(t.result.current.take()).toBe('/Photos');
  });
});

const noop = (): void => {};

function toolbar(path: string): void {
  render(
    <VFSToolbar
      currentPath={path} onNavigate={noop} onNewFolder={noop} onUploadFile={noop}
      uploadDisabledReason={uploadRefusal(path)} onSync={noop}
    />,
  );
}

describe('the toolbar upload button', () => {
  it('is disabled with the reason in Sent Files, before a file is picked', () => {
    toolbar('/Sent Files');
    const button: HTMLElement = screen.getByRole('button', { name: 'Upload file' });
    expect(button).toBeDisabled();
    expect(button.parentElement?.getAttribute('title')).toMatch(/P2P Chat/);
  });

  it('is live in an ordinary folder', () => {
    toolbar('/Docs');
    expect(screen.getByRole('button', { name: 'Upload file' })).toBeEnabled();
  });
});
