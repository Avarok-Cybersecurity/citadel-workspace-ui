/**
 * "Deregister Removes: FAIL" beside "Deregister Permanent: PASS".
 *
 * That pair says the row was gone after a reload and still on screen before
 * one. `sign-out-session` already removes it LAST, after its own reload, and
 * its comment explains why — a list fetched a moment after a deregistration can
 * still contain the session. That is enough against the one reload it performs
 * and no help at all against the next one, which arrives on its own:
 * deregistering stops the WASM client, and the reconnection fires
 * `on-ws-connection-success`, which reloads the list from the same server.
 *
 * So the removal needs to outlive the function that performed it, until the
 * server stops reporting the session. A tombstone, not a timeout: the condition
 * is "the server still says this exists", so the thing to wait on is the server
 * no longer saying it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  forgetSession,
  isForgotten,
  reconcileForgotten,
  rememberEverything,
} from '../forgotten-sessions';

describe('a session this tab deregistered', () => {
  beforeEach((): void => { rememberEverything(); });

  it('stays hidden while the server still lists it', () => {
    forgetSession(7n);
    // The reload that the reconnection triggers, answering from a connection
    // map the deregistration has not reached yet.
    reconcileForgotten([7n, 9n]);

    expect(isForgotten(7n)).toBe(true);
    expect(isForgotten(9n)).toBe(false);
  });

  it('stops being hidden once the server drops it', () => {
    // The positive control: a tombstone that never expires hides a CID for the
    // life of the tab, and CIDs are permanent, so the same account logging back
    // in would be invisible.
    forgetSession(7n);
    reconcileForgotten([9n]);

    expect(isForgotten(7n)).toBe(false);
  });

  it('hides nothing by default', () => {
    reconcileForgotten([7n]);
    expect(isForgotten(7n)).toBe(false);
  });
});
