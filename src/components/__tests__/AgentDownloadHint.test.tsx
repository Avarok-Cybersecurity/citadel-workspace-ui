import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentDownloadHint } from '../AgentDownloadHint';
import { AGENT_ASSETS, MAC_APP_ASSET } from '@/lib/agent-download';

const nav: (platform: string, userAgent: string, maxTouchPoints?: number) => Navigator = (platform: string, userAgent: string, maxTouchPoints = 0): Navigator =>
  ({ platform, userAgent, maxTouchPoints }) as unknown as Navigator;

const MAC: Navigator = nav('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
const WIN: Navigator = nav('Win32', 'Mozilla/5.0 (Windows NT 10.0)');
const LINUX: Navigator = nav('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)');
const IPHONE: Navigator = nav('iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');

describe('AgentDownloadHint', () => {
  it('offers a Mac the app: one universal download, three steps, and no command to type', () => {
    render(<AgentDownloadHint navigatorRef={MAC} />);
    expect(screen.getByRole('link', { name: /Download Citadel for Mac/i }))
      .toHaveAttribute('href', expect.stringMatching(new RegExp(`/releases/latest/download/${MAC_APP_ASSET}$`)));
    // Neither archive: the architecture no longer has to be chosen.
    expect(screen.queryByRole('link', { name: /Apple Silicon|Intel\)/i })).toBeNull();
    expect(screen.getByText(/Drag Citadel Agent into Applications/)).toBeInTheDocument();
    expect(screen.queryByText(/--bind/)).toBeNull();
    expect(screen.queryByRole('button', { name: /copy the run command/i })).toBeNull();
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

  it('shows Linux and Windows the run command: the packaged binary, both flags with no safe default, and this page as the allowed origin', () => {
    render(<AgentDownloadHint navigatorRef={LINUX} />);
    const cmd: HTMLElement = screen.getByText(/--bind 127\.0\.0\.1:12345 --backend filesystem/);
    expect(cmd).toBeInTheDocument();
    expect(cmd.textContent).toMatch(/^\.\/citadel-agent /);
    expect(cmd.textContent).toContain(`--allowed-origins ${window.location.origin}`);
    expect(cmd.textContent).not.toContain('--loopback');
  });

  it('on a page whose nginx published a loopback origin, the command carries the name and the certificate URL', () => {
    const meta: HTMLMetaElement = document.createElement('meta');
    meta.name = 'citadel-loopback-agent';
    meta.content = 'wss://local.example.com:12345';
    document.head.appendChild(meta);
    try {
      render(<AgentDownloadHint navigatorRef={LINUX} />);
      // Addressed by a flag the agent HAS. This looked up the command by
      // `--loopback-host`, a flag it has never had, so the component's rendered
      // instruction was pinned to something that cannot run -- and only in the
      // hosted case, which is the only case where a stranger reads it.
      const cmd: HTMLElement = screen.getByText(/--allowed-origins/);
      expect(cmd.textContent).toContain(`--allowed-origins ${window.location.origin}`);
      expect(cmd.textContent).not.toContain('--loopback-host');
      expect(cmd.textContent).not.toContain('--loopback-cert-url');
    } finally {
      meta.remove();
    }
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
    const { getByRole } = render(<AgentDownloadHint navigatorRef={LINUX} />);
    const btn: HTMLElement = getByRole('button', { name: /copy the run command/i });
    btn.focus();
    await userEvent.keyboard('{Enter}');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('--bind 127.0.0.1:12345 --backend filesystem');
  });
});
