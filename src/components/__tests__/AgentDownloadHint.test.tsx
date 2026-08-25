import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const arm = screen.getByRole('link', { name: /Apple Silicon/i });
    const intel = screen.getByRole('link', { name: /Intel/i });
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
    const cmd = screen.getByText(/--bind 127\.0\.0\.1:12345 --backend filesystem/);
    expect(cmd).toBeInTheDocument();
  });

  it('always links the releases page, so an unrecognised platform is not a dead end', () => {
    render(<AgentDownloadHint navigatorRef={nav('', '')} />);
    expect(screen.getByRole('link', { name: /All releases/i }))
      .toHaveAttribute('href', expect.stringContaining('/releases/latest'));
  });
});
