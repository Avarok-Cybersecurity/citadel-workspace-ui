/**
 * The Citadel App ABI, version 1, as the host sees it: the one import namespace, its names, the
 * exports a module must have, and the negative codes a host call can return. The Rust guest SDK
 * implements the other side of this same text; inspect.ts refuses any module that steps outside it.
 *
 * Replies are not values but handles: a host call answers a handle (>= 0) the guest reads with
 * `reply_read`. A refusal is still a reply ({refused: ...}); a negative code means the call itself
 * was malformed at the ABI level (a pointer outside memory, an unknown handle).
 */

export const ABI_NAMESPACE = 'citadel_app_abi_1';

/** One import function per capability group, each `(op, ptr, len) -> i32`. */
export const ABI_GROUPS = [
  'canvas', 'ui', 'events', 'navigate', 'nodes', 'md', 'files', 'chat', 'members',
  'storage', 'net', 'ihttp', 'clipboard', 'notify', 'documents', 'log',
] as const;

export type AbiGroup = (typeof ABI_GROUPS)[number];

const GROUP_SET: ReadonlySet<string> = new Set<string>(ABI_GROUPS);

export function isAbiGroup(name: string): name is AbiGroup {
  return GROUP_SET.has(name);
}

/** The non-group imports: the imported memory and the two reply readers. */
export const ABI_MEMORY_IMPORT = 'memory';
export const ABI_REPLY_READ = 'reply_read';
export const ABI_REPLY_LEN = 'reply_len';

/** Exports every module must have, all functions. */
export const ABI_REQUIRED_EXPORTS = ['app_alloc', 'app_free', 'app_init', 'app_event'] as const;
/** Exports a module may have; when present they must be functions. */
export const ABI_OPTIONAL_EXPORTS = ['app_frame'] as const;

/** `app_init` returns this when the app started. Anything else is the app's own failure status. */
export const APP_INIT_OK = 0;

/** Negative return codes of a group call, `reply_read` and `reply_len`. */
export const ABI_ERR = {
  /** ptr/len outside the module's memory. (A request that is not CBOR is a reply: {refused: {policy: "bad_arguments"}}.) */
  badRequest: -1,
  /** The handle was never issued, or was already read. */
  unknownHandle: -2,
  /** The reply has not arrived yet; an AppEvent `{reply_ready: {handle}}` follows when it does. */
  pending: -3,
  /** `reply_read`'s cap is smaller than the reply; nothing was copied, the handle stays live. */
  bufferTooSmall: -4,
  /** Too many replies issued and not yet read. */
  handlesExhausted: -5,
} as const;
