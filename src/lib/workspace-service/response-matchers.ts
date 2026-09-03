/**
 * Payload checks that tell OUR answer apart from someone else's broadcast.
 *
 * The workspace protocol carries no request id, so `awaitWriteResponse` matches
 * responses by type. That was safe while those variants were only ever sent to
 * the client that asked — and stopped being safe when the server began
 * broadcasting `Node`, `NodeDeleted` and `NodeMoved` to every other member so
 * their trees would update live.
 *
 * The consequence is worse than a mismatched toast. Alice saves a document and
 * the server is about to refuse it; Bob renames any node in the same 15-second
 * window; his broadcast `Node` resolves Alice's pending write; the editor closes
 * on "success" and reloads the stored copy over her buffer. Her text is gone
 * under a green toast — the exact data loss the write gate was built to end.
 *
 * These are narrowing checks, not identity: without a request id, two writes to
 * the SAME node in flight at once still cannot be told apart. That remains a
 * property of the protocol, and is recorded in await-write-response.
 */

function field(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== 'object') return undefined;
  return (payload as Record<string, unknown>)[key];
}

/** `Node(DomainNode)` — the node itself, so its own `id`. */
export function nodeWithId(nodeId: string) {
  return (payload: unknown): boolean => field(payload, 'id') === nodeId;
}

/** `NodeDeleted` / `NodeMoved` — both name the node they are about. */
export function aboutNode(nodeId: string) {
  return (payload: unknown): boolean => field(payload, 'node_id') === nodeId;
}

/**
 * Creation is the awkward one: the client does not know the new node's id, so
 * it matches on what it does know. Two members creating a same-named sibling
 * simultaneously could still cross, which is strictly better than any `Node` at
 * all resolving the write.
 */
export function newChildOf(parentId: string | null, name: string) {
  return (payload: unknown): boolean =>
    field(payload, 'name') === name && (field(payload, 'parent_id') ?? null) === parentId;
}

/**
 * `MemberRoleUpdated` — names the member whose role changed.
 *
 * This variant became a broadcast when demotions were made to reach the
 * demoted user's own client. Before that it went only to the acting admin, so
 * matching by type alone was safe; now another admin's role change in the same
 * 15s window would resolve this one.
 */
export function aboutMember(userId: string) {
  return (payload: unknown): boolean => field(payload, 'user_id') === userId;
}
