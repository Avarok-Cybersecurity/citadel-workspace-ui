/**
 * Where to send someone whose browser cannot reach the local agent.
 *
 * The agent is a separate binary the user runs on their own machine; the web
 * app is useless without one. Telling them "unable to reach the connection
 * service" and stopping there is only half an answer if they have never
 * installed it.
 *
 * The asset names below are a CONTRACT with .github/workflows/release-agent.yml.
 * Nothing at runtime would notice them drifting apart — a renamed asset simply
 * yields a 404 the moment a user clicks, which is the worst place to discover
 * it. `agent-download.test.ts` reads the workflow and fails if the two lists
 * stop matching.
 */

/** Stable platform tokens, matching the release workflow's matrix. */
export type AgentPlatform = 'macos-arm64' | 'macos-x64' | 'linux-x64' | 'windows-x64';

export const AGENT_ASSETS: Record<AgentPlatform, string> = {
  'macos-arm64': 'citadel-agent-macos-arm64.tar.gz',
  'macos-x64': 'citadel-agent-macos-x64.tar.gz',
  'linux-x64': 'citadel-agent-linux-x64.tar.gz',
  'windows-x64': 'citadel-agent-windows-x64.zip',
};

export const RELEASES_PAGE =
  'https://github.com/Avarok-Cybersecurity/citadel-workspace/releases/latest';

/**
 * Which agent builds could run on this visitor's machine.
 *
 * Returns a LIST, not a best guess. macOS is the reason: Safari and Chrome both
 * report "MacIntel" for `navigator.platform` on Apple Silicon, and the reliable
 * discriminator (`userAgentData.getHighEntropyValues`) is async and absent in
 * Safari. Guessing hands an Intel archive to an ARM Mac, which fails only after
 * the download completes and looks like a broken release. Offering both costs
 * the user one decision and cannot be wrong.
 *
 * An empty list means no agent build fits — phones and tablets, which report
 * Linux or Mac but cannot run it. The UI shows the releases page instead of a
 * download that would not work.
 */
export function agentPlatformCandidates(nav: Navigator = navigator): AgentPlatform[] {
  const uaData = (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform: string = (uaData?.platform ?? nav.platform ?? '').toLowerCase();
  const ua: string = (nav.userAgent ?? '').toLowerCase();

  if (platform.includes('win') || ua.includes('windows')) return ['windows-x64'];

  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('android')) return [];

  if (platform.includes('linux') || ua.includes('linux')) return ['linux-x64'];

  if (platform.includes('mac') || ua.includes('mac os')) {
    // iPadOS masquerades as a Mac; touch points give it away.
    if ((nav.maxTouchPoints ?? 0) > 2) return [];
    return ['macos-arm64', 'macos-x64'];
  }

  return [];
}

/** Download URL for an asset, resolved by GitHub to the newest release. */
export function agentDownloadUrl(platform: AgentPlatform): string {
  return `https://github.com/Avarok-Cybersecurity/citadel-workspace/releases/latest/download/${AGENT_ASSETS[platform]}`;
}
