/**
 * The first-party publishers' ML-DSA-65 keys, as the kernel lists them
 * (`FIRST_PARTY_PUBLISHER_KEYS` in citadel-workspace-server-kernel/src/kernel/apps/install.rs; a
 * test holds this copy to it). The kernel decides what being first-party allows; the page only
 * uses it to list first-party apps first.
 */
export const FIRST_PARTY_PUBLISHER_KEYS: readonly string[] = [];

export function isFirstPartyKey(key: string): boolean {
  return FIRST_PARTY_PUBLISHER_KEYS.includes(key);
}
