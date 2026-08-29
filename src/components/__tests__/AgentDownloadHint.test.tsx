import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentDownloadHint } from '../AgentDownloadHint';
import { AGENT_ASSETS } from '@/lib/agent-download';

const nav = (platform: string, userAgent: string, maxTouchPoints = 0) =>
  ({ platform, userAgent, maxTouchPoints }) as unknown as Navigator;

const MAC = nav('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
const WIN = nav('Win32', 'Mozilla/5.0 (Windows NT 10.0)');
const IPHONE = nav('iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');

describe('AgentDownloadHint', () => {
  it('offers both mac builds, since the architecture cannot be told apart', () => {
    render(<AgentDownloadHint navigatorRef={MAC} />);
    const arm: HTMLElement = screen.getByRole('link', { name: /Apple Silicon/i });
    const intel: HTMLElement = screen.getByRole('link', { name: /Intel/i });
    expect(arm).toHaveAttribute('href', expect.stringContaining(AGENT_ASSETS['macos-arm64']));
    expect(intel).toHaveAttribute('href', expect.stringContaining(AGENT_ASSETS['macos-x64']));
  });

  it('offers exactly one build on Windows', () => {
    render(<AgentDownloadHint navigatorRef={WIN} />);
    expect(screen.getByRole('link', { name: /Windows/i }))
      .toHaveAttribute('href', expect.stringContaining(AGENT_ASSETS['windows-x64']));
    expect(screen.queryByRole('link', { name: /macOS/i })).toBeNull();
  });

  it('offers NO download on a phone, which cannot host an agent', () => {
    // The failure this guards is a download that completes and then cannot run:
    // worse than no offer, because it looks like a broken release.
    render(<AgentDownloadHint navigatorRef={IPHONE} />);
    expect(screen.queryByRole('link', { name: /macOS|Windows|Linux/i })).toBeNull();
    expect(screen.getByText(/desktop or laptop/i)).toBeInTheDocument();
  });

  it('always shows the run command, including both flags that have no safe default', () => {
    render(<AgentDownloadHint navigatorRef={MAC} />);
    const cmd: HTMLElement = screen.getByText(/--bind 127\.0\.0\.1:12345 --backend filesystem/);
    expect(cmd).toBeInTheDocument();
  });

  it('always links the releases page, so an unrecognised platform is not a dead end', () => {
    render(<AgentDownloadHint navigatorRef={nav('', '')} />);
    expect(screen.getByRole('link', { name: /All releases/i }))
      .toHaveAttribute('href', expect.stringContaining('/releases/latest'));
  });
});

describe('copy control', () => {
  it('copies exactly once per keyboard activation', async () => {
    // Worth pinning because it looks like it should double-fire and does not.
    // A native <button> activates on Enter by itself, and interactive() — which
    // exists for non-button elements — adds its own onKeyDown on top. The
    // reason one press yields one copy is that activateOnKey preventDefault()s
    // Enter and Space, which suppresses the native activation. Remove that
    // preventDefault and this test catches the duplicate.
    const writes: string[] = [];
    Object.assign(navigator, {
      clipboard: { writeText: (t: string) => { writes.push(t); return Promise.resolve(); } },
    });
    const { getByRole } = render(<AgentDownloadHint navigatorRef={MAC} />);
    const btn: HTMLElement = getByRole('button', { name: /copy the run command/i });
    btn.focus();
    await userEvent.keyboard('{Enter}');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('--bind 127.0.0.1:12345 --backend filesystem');
  });
});
