/**
 * The security posture a user gets when they never opened the security step.
 *
 * These literals were written out three times — the security form's initial
 * state, the registration hook's fallback, the login hook's initial state — so
 * "the default" was whichever copy you happened to read. They are the values a
 * real account is created with, which makes disagreement between the copies a
 * security question, not a tidiness one.
 */

import type { SecuritySettingsValues } from './SecuritySettings';

export const DEFAULT_SECURITY_SETTINGS = {
  securityLevel: 'Standard',
  secrecyMode: 'BestEffort',
  encryptionAlgorithm: 'AES_GCM_256',
  kemAlgorithm: 'MlKem',
  sigAlgorithm: 'None',
  headerObfuscatorSettings: {},
  storeCredentials: false,
} as const satisfies SecuritySettingsValues & { storeCredentials: boolean };
