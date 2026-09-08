/**
 * Turn a user's stored avatar into something an `<img src>` can take.
 *
 * The server keeps it in `User.metadata` as
 * `MetadataValue::String(base64)`, which reaches the client as a tagged enum —
 * `{ type: "String", content: "…" }` — and older payloads have been seen as a
 * bare string and as `{ String: "…" }`. Three shapes, and until now each caller
 * unpacked them itself: `useEventEmitterSetup` handled all three,
 * `GeneralSettingsTab` handled only `.content`. Two readers of one wire format
 * drift, and the one that drifts is the one nobody is looking at.
 *
 * So this is the single place that knows the shape.
 */

/** What the server may send for `metadata.avatar`. */
type AvatarMetadata = string | { content?: unknown; String?: unknown } | undefined;

/**
 * The base64 the server stores carries no data-URL prefix, so one is added.
 * `image/webp` because `processAvatarImage` encodes WebP before upload — the
 * browser sniffs the real type anyway, but a wrong label is still a lie.
 */
const DATA_URL_PREFIX: string = 'data:image/webp;base64,';

export function avatarUrlFromMetadata(metadata: unknown): string | undefined {
  if (metadata === null || typeof metadata !== 'object') return undefined;
  const avatar: AvatarMetadata = (metadata as { avatar?: AvatarMetadata }).avatar;
  if (avatar === undefined) return undefined;

  const raw: unknown = typeof avatar === 'string' ? avatar : (avatar.content ?? avatar.String);
  if (typeof raw !== 'string' || raw.length === 0) return undefined;

  // Already a data URL on the paths that round-trip one; do not double-prefix.
  return raw.startsWith('data:') ? raw : `${DATA_URL_PREFIX}${raw}`;
}
