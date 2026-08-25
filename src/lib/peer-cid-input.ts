/**
 * Is what the user typed usable as a peer CID?
 *
 * Separated from the component because the component reaches for two service
 * singletons on mount, so testing this rule through it would mean mocking both
 * to assert a string check.
 *
 * The rule matters more than it looks. `BigInt('alice')` THROWS, and the
 * add-peer handler used to let that land in a catch that only called debugLog —
 * a no-op outside dev. So a username, a pasted value with a space, or a typo
 * produced no error, no message and no cleared field: the button did nothing at
 * all. Anything that widens this must keep the caller's error path intact.
 */
export function isUsablePeerCid(value: string): boolean {
  return /^[0-9]+$/.test(value.trim());
}
