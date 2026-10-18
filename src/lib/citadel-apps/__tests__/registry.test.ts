/**
 * The Citadel App registry: every id has exactly one entry, R1 ships Docs only, and there is no
 * default app to fall back on. No mocks.
 */
import { describe, it, expect } from 'vitest';
import * as registry from '../registry';
import { CITADEL_APPS, CITADEL_APP_IDS, citadelApp, isCitadelAppId, type CitadelApp } from '../registry';

describe('the Citadel App registry', () => {
  it('has one entry per id, each with a name, icon and extensions', () => {
    expect(CITADEL_APPS.map((app: CitadelApp): string => app.id)).toEqual([...CITADEL_APP_IDS]);
    for (const id of CITADEL_APP_IDS) {
      const app: CitadelApp = citadelApp(id);
      expect(app.name).not.toBe('');
      expect(app.icon).toBeTruthy();
      expect(app.fileExtensions.length).toBeGreaterThan(0);
    }
  });

  it('offers Docs and lists PDF and LaTeX as not yet available', () => {
    const available: string[] = CITADEL_APPS.filter((app: CitadelApp): boolean => app.available).map((app: CitadelApp): string => app.id);
    expect(available).toEqual(['docs']);
  });

  it('has no default app: nothing exported names one, and unknown ids are refused', () => {
    expect(Object.keys(registry).filter((key: string): boolean => /default/i.test(key))).toEqual([]);
    for (const value of [undefined, null, '', 'Docs', 'sheets', 0]) expect(isCitadelAppId(value)).toBe(false);
  });
});
