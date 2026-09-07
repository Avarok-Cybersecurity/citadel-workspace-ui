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

export const RELEASES_PAGE: "https://github.com/Avarok-Cybersecurity/citadel-workspace/releases/latest" =
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
  const uaData: { platform?: string; } | undefined = (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
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

/** What the hosted page knows that the command needs. */
export interface RunCommandInputs {
  platform: AgentPlatform;
  /** The page's own origin: the one page this agent should let drive it. */
  pageOrigin: string;
  /** The published loopback origin (`wss://local.example.com:12345`), or none. */
  loopbackOrigin: string | undefined;
}

/**
 * The exact command to start the agent for THIS page.
 *
 * Two things a visitor could not have guessed: the binary in the archive is `citadel-agent`
 * (the release workflow names it so; a test here checks that against the workflow), and the
 * agent refuses to start without `--allowed-origins`. Both are derivable from the page, so
 * the page says them. A copy button that yields something unrunnable is worse than none: it
 * looks like the instruction, so the reader stops looking for the real one -- which is what
 * this function did for every hosted visitor until the two invented `--loopback-*` flags
 * below were removed.
 *
 * Every flag emitted here is checked against the agent's own CLI by
 * scripts/check-the-run-command-uses-real-flags.mjs.
 */
export function agentRunCommand({ platform, pageOrigin, loopbackOrigin }: RunCommandInputs): string {
  const binary: string = platform === 'windows-x64' ? '.\\citadel-agent.exe' : './citadel-agent';
  const parts: string[] = [
    binary,
    '--bind 127.0.0.1:12345',
    '--backend filesystem',
    `--allowed-origins ${pageOrigin}`,
  ];
  // NO loopback flags. This used to append `--loopback-host` and
  // `--loopback-cert-url`, and the agent has never had either:
  //
  //   error: Found argument '--loopback-host' which wasn't expected
  //
  // Its whole CLI is --bind, --backend, --data-dir, --allowed-origins,
  // --tls-cert, --tls-key, --no-tls and --dangerous. Worse, the two were
  // appended only when `loopbackOrigin` is set -- which is exactly the hosted
  // deployment, and nowhere else. So the one place this command matters, every
  // visitor was handed something the agent refuses to start with, and the
  // comment above this function names that failure precisely: a copy button
  // that yields something unrunnable is worse than none, because it looks like
  // the instruction and the reader stops looking for the real one.
  //
  // Nothing is needed in their place. The agent serves TLS by default and
  // carries the certificate for the published loopback name compiled into it
  // (see BUILTIN_TLS_CERT), so a visitor configures nothing. An operator
  // publishing a DIFFERENT loopback name supplies --tls-cert/--tls-key when
  // they start their own agent; that is an operator's decision and not
  // something this page can know or should guess.
  //
  // `loopbackOrigin` is still taken, and still meaningful: it is what tells the
  // page it is hosted rather than local. It simply does not change the command.
  void loopbackOrigin;
  return parts.join(' ');
}
