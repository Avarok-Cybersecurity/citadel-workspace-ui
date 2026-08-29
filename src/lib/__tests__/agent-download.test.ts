import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  AGENT_ASSETS,
  agentDownloadUrl,
  agentPlatformCandidates,
  type AgentPlatform,
} from '../agent-download';

const WORKFLOW: string = join(process.cwd(), '..', '.github', 'workflows', 'release-agent.yml');

const nav: (platform: string, userAgent: string, maxTouchPoints?: number) => Navigator = (platform: string, userAgent: string, maxTouchPoints = 0): Navigator =>
  ({ platform, userAgent, maxTouchPoints }) as unknown as Navigator;

describe('agent asset names match the release workflow', () => {
  it('finds the workflow', () => {
    // If this file moves, every assertion below would pass vacuously by
    // matching nothing at all.
    expect(existsSync(WORKFLOW)).toBe(true);
  });

  it('every asset the UI links to is built and published by the workflow', () => {
    const yaml: string = readFileSync(WORKFLOW, 'utf8');
    const published: Set<string> = new Set(
      [...yaml.matchAll(/asset:\s*(citadel-agent-[\w.-]+)/g)].map((m) => m[1]),
    );
    // Guard against the regex silently matching nothing.
    expect(published.size).toBeGreaterThanOrEqual(4);

    for (const [platform, asset] of Object.entries(AGENT_ASSETS)) {
      expect(
        published.has(asset),
        `The UI offers "${asset}" for ${platform}, but release-agent.yml builds no such asset. ` +
          `A user clicking that link gets a 404 from GitHub. Published: ${[...published].join(', ')}`,
      ).toBe(true);
    }
  });

  it('the workflow publishes nothing the UI cannot offer', () => {
    const yaml: string = readFileSync(WORKFLOW, 'utf8');
    const published: string[] = [...yaml.matchAll(/asset:\s*(citadel-agent-[\w.-]+)/g)].map((m) => m[1]);
    const offered: Set<string> = new Set(Object.values(AGENT_ASSETS));
    for (const asset of published) {
      expect(
        offered.has(asset),
        `release-agent.yml builds "${asset}" but no platform in AGENT_ASSETS offers it, ` +
          `so it is built, uploaded, and unreachable from the app.`,
      ).toBe(true);
    }
  });
});

describe('platform candidates', () => {
  it('offers a single build for Windows and Linux', () => {
    expect(agentPlatformCandidates(nav('Win32', 'Mozilla/5.0 (Windows NT 10.0)'))).toEqual(['windows-x64']);
    expect(agentPlatformCandidates(nav('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)'))).toEqual(['linux-x64']);
  });

  it('offers BOTH mac builds rather than guessing the architecture', () => {
    // Apple Silicon reports MacIntel, so a single answer here would be wrong
    // half the time — and wrong only after the download finishes.
    const macs: AgentPlatform[] = agentPlatformCandidates(nav('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'));
    expect(macs).toEqual(['macos-arm64', 'macos-x64']);
  });

  it('offers nothing on phones and tablets, which cannot run the agent', () => {
    expect(agentPlatformCandidates(nav('iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'))).toEqual([]);
    expect(agentPlatformCandidates(nav('Linux armv8l', 'Mozilla/5.0 (Linux; Android 14)'))).toEqual([]);
    // iPadOS claims to be a desktop Mac; touch points are the tell.
    expect(agentPlatformCandidates(nav('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5))).toEqual([]);
  });

  it('offers nothing when the platform is unrecognisable', () => {
    expect(agentPlatformCandidates(nav('', ''))).toEqual([]);
  });
});

describe('download URLs', () => {
  it('point at /releases/latest/download so no API call or token is needed', () => {
    for (const platform of Object.keys(AGENT_ASSETS) as AgentPlatform[]) {
      const url: string = agentDownloadUrl(platform);
      expect(url).toContain('/releases/latest/download/');
      expect(url.endsWith(AGENT_ASSETS[platform])).toBe(true);
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});
