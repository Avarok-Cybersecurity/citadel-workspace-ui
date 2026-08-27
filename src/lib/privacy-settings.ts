/**
 * The user's privacy choices, as a source the code that must obey them can read.
 *
 * These lived entirely inside `PrivacySettingsTab`: it wrote them to
 * localStorage and dispatched a `privacy-settings-changed` event that nothing
 * subscribed to. No field was read anywhere outside the tab that wrote it. On a
 * product whose pitch is that the user controls their own data, "Send read
 * receipts: off" still sent receipts and "Show typing indicators: off" still
 * showed them.
 *
 * Three of the six settings have a real enforcement point in the client and are
 * honoured from here. The other three do not, and saying so is part of the fix:
 *
 * - `allowDirectMessages` and `showProfileToStrangers` need the SERVER to
 *   refuse, since a client that declines to display something has not stopped
 *   anyone from sending it. Enforcing them here would be theatre with a
 *   reassuring switch on top.
 * - `notifyOnScreenshot` is not observable from a web page at all.
 *
 * They are marked `enforced: false` in `PRIVACY_ENFORCEMENT` so the UI can say
 * which promises it can actually keep, and so a future server-side gate has one
 * place to flip.
 */

const STORAGE_KEY = 'citadel:privacy-settings';
const CHANGE_EVENT = 'privacy-settings-changed';

export interface PrivacySettings {
  showOnlineStatus: boolean;
  showTypingIndicators: boolean;
  sendReadReceipts: boolean;
  allowDirectMessages: 'everyone' | 'connections' | 'nobody';
  showProfileToStrangers: boolean;
  notifyOnScreenshot: boolean;
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  showOnlineStatus: true,
  showTypingIndicators: true,
  sendReadReceipts: true,
  allowDirectMessages: 'connections',
  showProfileToStrangers: false,
  notifyOnScreenshot: false,
};

/** Which settings this client can actually act on today. */
export const PRIVACY_ENFORCEMENT: Record<keyof PrivacySettings, boolean> = {
  showOnlineStatus: true,
  showTypingIndicators: true,
  sendReadReceipts: true,
  allowDirectMessages: false,
  showProfileToStrangers: false,
  notifyOnScreenshot: false,
};

/**
 * Cached because the send paths consult this per keystroke (typing indicator)
 * and per message (read receipt); a synchronous localStorage read on each would
 * be a needless main-thread hit. Invalidated by every write, including writes
 * from another tab.
 */
let cached: PrivacySettings | null = null;

function readFromStorage(): PrivacySettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Merged over defaults, never returned verbatim: a blob saved by an older
    // build is missing every field added since, and `undefined` reads as "off"
    // for a boolean — silently turning a privacy setting the user never saw
    // into the more permissive answer, or the more restrictive one, at random.
    if (stored) return { ...DEFAULT_PRIVACY_SETTINGS, ...JSON.parse(stored) };
  } catch {
    // A corrupt or unreadable blob must not leave callers without an answer.
    // Defaults are the documented behaviour; failing open on a privacy setting
    // is not an option, and neither is throwing into a send path.
  }
  return DEFAULT_PRIVACY_SETTINGS;
}

export function getPrivacySettings(): PrivacySettings {
  if (!cached) cached = readFromStorage();
  return cached;
}

export function savePrivacySettings(settings: PrivacySettings): void {
  cached = settings;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked. The in-memory value still governs this session,
    // which is better than dropping the user's choice on the floor.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: settings }));
}

/** Drop the cache when another tab changes the settings. */
export function initPrivacySettingsSync(): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cached = null;
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
