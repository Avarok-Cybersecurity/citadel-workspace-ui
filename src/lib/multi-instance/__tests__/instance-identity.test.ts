/**
 * Duplicate Tab copies sessionStorage, so a twin boots with a byte-identical
 * instance id. The channel's self-traffic filter then made the twins invisible
 * to each other — neither saw the other's heartbeat or election claim, both took
 * the "no heartbeat ever received" branch, and both became leader permanently:
 * two WebSockets from one browser, each claiming every session away from the
 * other, every directed message processed twice.
 *
 * No storage survives a reload but not a duplication, so identity cannot be made
 * collision-proof by choosing a different store. It has to be detected at
 * runtime, using the one marker the instance id cannot supply: a per-DOCUMENT
 * nonce that is never persisted.
 */
import { describe, it, expect } from 'vitest';
import {
  documentNonce,
  isFromThisDocument,
  shouldReissueIdentity,
  mintInstanceId,
} from '../instance-identity';

const MY_ID = '1700000000000000123';

describe('self-traffic filtering', () => {
  it('drops our own messages', () => {
    expect(isFromThisDocument(MY_ID, documentNonce, MY_ID)).toBe(true);
  });

  it('does NOT drop a twin sharing our instance id', () => {
    // The whole defect in one assertion: same id, different document. Filtering
    // on the id alone returned true here and silenced the twin completely.
    expect(isFromThisDocument(MY_ID, 'some-other-document', MY_ID)).toBe(false);
  });

  it('falls back to the instance id for messages with no nonce', () => {
    // An older build in another tab still needs its own traffic filtered, or it
    // loops on its own broadcasts.
    expect(isFromThisDocument(MY_ID, undefined, MY_ID)).toBe(true);
    expect(isFromThisDocument('other-id', undefined, MY_ID)).toBe(false);
  });
});

describe('identity conflict resolution', () => {
  it('re-rolls when another document uses our id and its nonce is higher', () => {
    expect(shouldReissueIdentity(MY_ID, `${documentNonce}~higher`, MY_ID)).toBe(true);
  });

  it('exactly one of the pair yields', () => {
    const theirs = `${documentNonce}~higher`;
    const weYield = shouldReissueIdentity(MY_ID, theirs, MY_ID);
    // The twin computes the mirror case from the same two values. Both sides
    // must not yield (churn) and must not both keep it (the original bug).
    const theyYield = theirs < documentNonce;
    expect(weYield).not.toBe(theyYield);
  });

  it('ignores messages from a different instance id', () => {
    expect(shouldReissueIdentity('a-different-id', 'other-document', MY_ID)).toBe(false);
  });

  it('never re-rolls on our own message', () => {
    expect(shouldReissueIdentity(MY_ID, documentNonce, MY_ID)).toBe(false);
  });
});

describe('minted ids', () => {
  it('are distinct and BigInt-parseable, so election stays deterministic', () => {
    const ids = new Set(Array.from({ length: 200 }, () => mintInstanceId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(() => BigInt(id)).not.toThrow();
  });
});
