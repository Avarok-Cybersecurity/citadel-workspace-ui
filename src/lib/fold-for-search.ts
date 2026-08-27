/**
 * Normalise a string for matching.
 *
 * Every matcher in the app was `toLowerCase().includes(...)`, so "jose" did not
 * find "José" and "cafe" did not find "café". The names most likely to carry a
 * diacritic are exactly the ones a colleague will type without it, and the
 * sorting nearby already uses `localeCompare` — so a sorted list could show two
 * neighbours, one of which was unfindable by the obvious query.
 *
 * NFD splits a letter from its combining marks; the range strips the marks. It
 * does not attempt transliteration — "ß" does not become "ss" and "ø" does not
 * become "o" — because those are language-specific rules, and a matcher that is
 * right for German and wrong for Danish is worse than one that is predictable.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Whether `haystack` contains `needle`, ignoring case and diacritics. */
export function matchesSearch(haystack: string, needle: string): boolean {
  return foldForSearch(haystack).includes(foldForSearch(needle));
}
