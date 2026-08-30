import { describe, it, expect } from 'vitest';
import {
  COMPOSER_DIAGNOSTIC_KEYWORDS,
  COMPOSER_WITHHELD_SAMPLE,
  keywordsMatch,
} from '../composer-diagnostics.js';

describe('the composer diagnostic filter', () => {
  it('keeps the line that says why the composer was removed', () => {
    expect(keywordsMatch(COMPOSER_WITHHELD_SAMPLE, COMPOSER_DIAGNOSTIC_KEYWORDS)).toBe(true);
  });

  it('still filters something out, so it is a filter and not a passthrough', () => {
    // A list that matches everything would pass the first test for the wrong
    // reason.
    expect(keywordsMatch('[Router] routeMessage: type=GetSessionsResponse', COMPOSER_DIAGNOSTIC_KEYWORDS)).toBe(false);
  });
});
