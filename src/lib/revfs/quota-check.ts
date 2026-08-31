/**
 * Whether an upload fits, counting the uploads already in the air.
 *
 * `storageUsed` is derived from the tree, and the tree only grows once an upload
 * has landed. So a second drop started before the first one's write completes is
 * measured against a total that does not include it — two 60% drops both pass a
 * check against an 80% quota, and the limit is exceeded by exactly the amount
 * the user was told there was room for.
 *
 * The window is not small: an upload is a network round trip to the peer or the
 * server, and dropping a second batch while the first is still going is the
 * ordinary way people use a file manager.
 *
 * Kept pure and separate from the handler so the arithmetic can be tested
 * without a tree, a hook or a drop event.
 */
export interface QuotaRequest {
  /** Bytes the tree already accounts for. */
  used: number;
  /** The ceiling. */
  quota: number;
  /** Bytes of uploads started and not yet landed in the tree. */
  inFlight: number;
  /** Bytes this attempt would add. */
  incoming: number;
}

/** How much room is left, once uploads in the air are counted. */
export function remainingQuota(request: Omit<QuotaRequest, 'incoming'>): number {
  return Math.max(0, request.quota - request.used - request.inFlight);
}

export function wouldExceedQuota(request: QuotaRequest): boolean {
  return request.incoming > remainingQuota(request);
}
