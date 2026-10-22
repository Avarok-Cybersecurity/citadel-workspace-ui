/**
 * The host's resource policy for app instances (design 2.3, R4.3, R4.4). Every limit the host
 * enforces is a field here, and the policy is passed explicitly to whatever enforces it: no module
 * reads these constants behind its caller's back, so a test can tighten one without patching code.
 *
 * Two layers: HOST_CEILINGS are physics no policy may exceed (validateHostPolicy refuses one that
 * tries), STANDARD_HOST_POLICY is the policy the page runs with.
 */
import { IHTTP_INITIAL_CREDIT, IHTTP_MAX_CHUNK_BYTES } from '../sdk/generated/AbiConstants';

export interface IhttpLimits {
  readonly maxPathBytes: number;
  readonly maxHeaders: number;
  readonly maxHeaderBytes: number;
  readonly maxRequestBodyBytes: number;
  readonly maxResponseBodyBytes: number;
  readonly maxChunkBytes: number;
  readonly initialCredit: number;
  readonly streamTimeoutMs: number;
  /** A stream whose length was not declared (streaming) may live this long. */
  readonly streamingTimeoutMs: number;
  readonly maxStreamsPerCaller: number;
  readonly maxStreamsPerServer: number;
  readonly requestsPerSecondPerCaller: number;
  readonly maxRoutes: number;
}

export interface HostPolicy {
  /** The most memory an instance may have, in pages; the manifest may ask for less, never more. */
  readonly memoryMaxPages: number;
  /** A guest export (init, event, frame) that has not returned by now is terminated. */
  readonly computeBudgetMs: number;
  /** Network calls have their own clocks, separate from the compute budget. */
  readonly hostNetTimeoutMs: number;
  readonly serverNetTimeoutMs: number;
  /** Any other port call (storage, nodes, ...) that has not answered by now is refused. */
  readonly portTimeoutMs: number;
  /** Token buckets per instance: every host call, and the subset that reaches the server. */
  readonly hostCallsPerSecond: number;
  readonly serverCallsPerSecond: number;
  readonly maxLiveInstancesPerPage: number;
  /** A request the guest hands a group call, and a reply the host hands back. */
  readonly maxRequestBytes: number;
  readonly maxReplyBytes: number;
  /** Replies issued and not yet read, per instance. */
  readonly maxLiveReplies: number;
  /**
   * A READY reply the guest has not read within this long is released. The guest SDK abandons a
   * reply it cannot reserve memory for (no ABI call releases a handle), so without this a reply
   * the app can never read would hold host memory until the instance ends.
   */
  readonly replyTtlMs: number;
  readonly maxLogBytes: number;
  readonly ihttp: IhttpLimits;
}

export const HOST_CEILINGS = {
  /** 256 MiB. */
  memoryMaxPages: 4096,
  computeBudgetMs: 2000,
  maxLiveInstancesPerPage: 8,
} as const;

const ENVELOPE_BYTES: number = 64 * 1024;

export const STANDARD_IHTTP_LIMITS: IhttpLimits = {
  maxPathBytes: 2 * 1024,
  maxHeaders: 32,
  maxHeaderBytes: 1024,
  maxRequestBodyBytes: 4 * 1024 * 1024,
  maxResponseBodyBytes: 16 * 1024 * 1024,
  maxChunkBytes: IHTTP_MAX_CHUNK_BYTES,
  initialCredit: IHTTP_INITIAL_CREDIT,
  streamTimeoutMs: 30_000,
  streamingTimeoutMs: 60_000,
  maxStreamsPerCaller: 8,
  maxStreamsPerServer: 64,
  requestsPerSecondPerCaller: 30,
  maxRoutes: 64,
};

export const STANDARD_HOST_POLICY: HostPolicy = {
  /** 64 MiB. */
  memoryMaxPages: 1024,
  computeBudgetMs: 2000,
  hostNetTimeoutMs: 30_000,
  serverNetTimeoutMs: 30_000,
  portTimeoutMs: 10_000,
  hostCallsPerSecond: 200,
  serverCallsPerSecond: 20,
  maxLiveInstancesPerPage: 8,
  maxRequestBytes: STANDARD_IHTTP_LIMITS.maxRequestBodyBytes + ENVELOPE_BYTES,
  maxReplyBytes: STANDARD_IHTTP_LIMITS.maxResponseBodyBytes + ENVELOPE_BYTES,
  maxLiveReplies: 64,
  replyTtlMs: 2000,
  maxLogBytes: 4 * 1024,
  ihttp: STANDARD_IHTTP_LIMITS,
};

/** Throws for a policy that exceeds a ceiling or is not a positive whole number somewhere. */
export function validateHostPolicy(policy: HostPolicy): HostPolicy {
  const whole = (name: string, value: number): void => {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`host policy: ${name} must be a positive integer, got ${value}`);
  };
  const { ihttp, ...top } = policy;
  for (const [name, value] of Object.entries(top)) whole(name, value);
  for (const [name, value] of Object.entries(ihttp)) whole(`ihttp.${name}`, value);
  for (const name of Object.keys(HOST_CEILINGS) as (keyof typeof HOST_CEILINGS)[]) {
    if (policy[name] > HOST_CEILINGS[name]) throw new Error(`host policy: ${name} ${policy[name]} exceeds the host ceiling ${HOST_CEILINGS[name]}`);
  }
  return policy;
}

/**
 * The memory maximum, in pages, for a module: the manifest's request capped by the policy. A
 * manifest asking for more than the policy is clamped, not refused: the app sees a smaller
 * maximum and its allocator fails cleanly at the cap.
 */
export function memoryMaxPagesFor(manifestMemoryPages: number, policy: HostPolicy): number {
  if (!Number.isInteger(manifestMemoryPages) || manifestMemoryPages <= 0) {
    throw new Error(`manifest memory_pages must be a positive integer, got ${manifestMemoryPages}`);
  }
  return Math.min(manifestMemoryPages, policy.memoryMaxPages, HOST_CEILINGS.memoryMaxPages);
}

/**
 * The memory an instance is given: the module's declared minimum, and the smallest of the
 * manifest's request, the policy, the ceiling and the module's own declared maximum (an imported
 * memory may not exceed the maximum the module declared, or instantiation fails).
 */
export function instanceMemoryFor(
  module: { readonly minPages: number; readonly maxPages: number | null },
  manifestMemoryPages: number,
  policy: HostPolicy,
): { readonly initialPages: number; readonly maxPages: number } {
  const cap: number = memoryMaxPagesFor(manifestMemoryPages, policy);
  const maxPages: number = module.maxPages === null ? cap : Math.min(cap, module.maxPages);
  if (module.minPages > maxPages) throw new Error(`the module needs ${module.minPages} pages; at most ${maxPages} are allowed`);
  return { initialPages: module.minPages, maxPages };
}
