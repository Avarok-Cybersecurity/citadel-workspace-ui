/**
 * The theme rides in workspace metadata, which is a general-purpose byte field
 * that outlives the client that wrote it. These cover the round trip and, more
 * importantly, every way the bytes can be wrong — a workspace that will not
 * render is a much worse outcome than one rendering in the default theme.
 */
import { describe, it, expect } from 'vitest';
import { serializeTheme, deserializeTheme, validateTheme } from '../theme-serialization';
import { defaultTheme, findPreset } from '../presets';
import { beginEdit, setToken } from '../theme-editing';

describe('round trip', () => {
  it('survives serialization unchanged', () => {
    const theme = defaultTheme();

    expect(deserializeTheme(serializeTheme(theme))).toEqual(theme);
  });

  it('preserves a user theme, including its edits and derived flag', () => {
    const edited = setToken(beginEdit(findPreset('nord')!), 'light', 'primary', { h: 12, s: 34, l: 56 });

    const restored = deserializeTheme(serializeTheme(edited));

    expect(restored).toEqual(edited);
    expect(restored?.light.primary).toEqual({ h: 12, s: 34, l: 56 });
    expect(restored?.isPreset).toBe(false);
  });

  it('preserves an emoji icon and one without', () => {
    const withEmoji = { ...defaultTheme(), icon: { emoji: '🛡️', color: { h: 10, s: 20, l: 30 } } };

    expect(deserializeTheme(serializeTheme(withEmoji))?.icon.emoji).toBe('🛡️');
    expect(deserializeTheme(serializeTheme(defaultTheme()))?.icon.emoji).toBeUndefined();
  });

  it('accepts the plain number[] form a wire decoder may hand back', () => {
    const bytes = Array.from(serializeTheme(defaultTheme()));

    expect(deserializeTheme(bytes)).toEqual(defaultTheme());
  });
});

describe('rejecting unusable metadata', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty bytes', new Uint8Array()],
  ])('returns null for %s so the caller can fall back', (_label, input) => {
    expect(deserializeTheme(input as Uint8Array | null | undefined)).toBeNull();
  });

  it('returns null for bytes another feature wrote', () => {
    // metadata is general purpose; someone else's payload landing here is
    // expected rather than exceptional.
    expect(deserializeTheme(new TextEncoder().encode('not json at all'))).toBeNull();
    expect(deserializeTheme(new TextEncoder().encode('{"some":"other feature"}'))).toBeNull();
  });

  it('refuses a version it does not understand rather than guessing', () => {
    const future = new TextEncoder().encode(JSON.stringify({ v: 99, theme: defaultTheme() }));

    expect(deserializeTheme(future)).toBeNull();
  });
});

describe('validateTheme', () => {
  it('accepts a well-formed theme', () => {
    expect(validateTheme(JSON.parse(JSON.stringify(defaultTheme())))).not.toBeNull();
  });

  it('refuses a palette missing a single token', () => {
    // The important one: a partial palette would apply as an override, leaving
    // that token at whatever the previous theme set — one stray colour with no
    // explanation.
    const broken = JSON.parse(JSON.stringify(defaultTheme()));
    delete broken.light.border;

    expect(validateTheme(broken)).toBeNull();
  });

  it('refuses a colour with an out-of-range channel', () => {
    const broken = JSON.parse(JSON.stringify(defaultTheme()));
    broken.dark.primary.l = 140;

    expect(validateTheme(broken)).toBeNull();
  });

  it('refuses a colour whose channels are strings', () => {
    const broken = JSON.parse(JSON.stringify(defaultTheme()));
    broken.light.primary = { h: '257', s: '45', l: '45' };

    expect(validateTheme(broken)).toBeNull();
  });

  it.each([
    ['id', ''],
    ['name', ''],
  ])('refuses an empty %s', (field, value) => {
    const broken = JSON.parse(JSON.stringify(defaultTheme()));
    broken[field] = value;

    expect(validateTheme(broken)).toBeNull();
  });

  it('refuses a negative radius', () => {
    const broken = JSON.parse(JSON.stringify(defaultTheme()));
    broken.radius = -1;

    expect(validateTheme(broken)).toBeNull();
  });

  it('refuses a missing icon colour', () => {
    const broken = JSON.parse(JSON.stringify(defaultTheme()));
    broken.icon = { emoji: '🛡️' };

    expect(validateTheme(broken)).toBeNull();
  });

  it.each([
    ['a string', 'theme'],
    ['an array', []],
    ['null', null],
  ])('refuses %s', (_label, input) => {
    expect(validateTheme(input)).toBeNull();
  });
});
