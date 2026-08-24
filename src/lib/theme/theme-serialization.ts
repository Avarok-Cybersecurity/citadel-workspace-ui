import type { WorkspaceTheme, ThemePalette, HslColor, WorkspaceIcon } from './theme-types';
import { defaultTheme } from './presets';

/**
 * Carrying a theme in the workspace's `metadata` bytes.
 *
 * UpdateWorkspace already has `metadata: Option<Vec<u8>>`, so the workspace
 * theme needs no protocol change — it rides in the bytes every member already
 * receives with the workspace.
 *
 * JSON rather than CBOR: a theme is numbers and short strings with no BigInt,
 * so the reason the P2P wire uses CBOR does not apply, and a metadata blob that
 * a human can read in a debugger is worth more here than a few saved bytes.
 *
 * The envelope is versioned because this outlives the client that wrote it. A
 * member on an older build must not be handed a payload it silently
 * misinterprets — it gets the default instead, and the workspace still renders.
 */

const ENVELOPE_VERSION = 1;

interface ThemeEnvelope {
  v: number;
  theme: unknown;
}

export function serializeTheme(theme: WorkspaceTheme): Uint8Array {
  const envelope: ThemeEnvelope = { v: ENVELOPE_VERSION, theme };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

/**
 * Read a theme out of workspace metadata.
 *
 * Returns null rather than throwing on anything unusable — absent metadata, a
 * different producer's bytes, a newer version, a malformed palette. The caller
 * falls back to the default, because a workspace that will not render is a far
 * worse outcome than one that renders in the default theme.
 */
export function deserializeTheme(bytes: Uint8Array | number[] | null | undefined): WorkspaceTheme | null {
  if (!bytes) return null;
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (array.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(array));
  } catch {
    // Metadata is a general-purpose field; another feature's bytes landing here
    // is expected, not exceptional.
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed.v !== ENVELOPE_VERSION) return null;

  return validateTheme(parsed.theme);
}

/**
 * Accept a theme only if every field is present and well-formed.
 *
 * Deliberately strict: a palette missing one token would apply as a partial
 * override, leaving that token at whatever the previous theme set — which shows
 * up as one stray colour nobody can explain.
 */
export function validateTheme(value: unknown): WorkspaceTheme | null {
  if (!isRecord(value)) return null;

  const { id, name, isPreset, radius, darkIsDerived } = value;
  if (typeof id !== 'string' || !id) return null;
  if (typeof name !== 'string' || !name) return null;
  if (typeof isPreset !== 'boolean') return null;
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0) return null;
  if (typeof darkIsDerived !== 'boolean') return null;

  const light = validatePalette(value.light);
  const dark = validatePalette(value.dark);
  const icon = validateIcon(value.icon);
  if (!light || !dark || !icon) return null;

  return { id, name, isPreset, icon, radius, light, dark, darkIsDerived };
}

/** Token keys, taken from a real palette so this cannot drift from the type. */
const TOKEN_KEYS = Object.keys(defaultTheme().light) as (keyof ThemePalette)[];

function validatePalette(value: unknown): ThemePalette | null {
  if (!isRecord(value)) return null;

  const palette = {} as ThemePalette;
  for (const key of TOKEN_KEYS) {
    const color = validateColor(value[key]);
    if (!color) return null;
    palette[key] = color;
  }
  return palette;
}

function validateColor(value: unknown): HslColor | null {
  if (!isRecord(value)) return null;
  const { h, s, l } = value;
  if (!isFiniteNumber(h) || !isFiniteNumber(s) || !isFiniteNumber(l)) return null;
  // Out-of-range channels mean the producer was not writing an HslColor.
  if (h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) return null;
  return { h, s, l };
}

function validateIcon(value: unknown): WorkspaceIcon | null {
  if (!isRecord(value)) return null;

  const color = validateColor(value.color);
  if (!color) return null;

  const emoji = value.emoji;
  if (emoji !== undefined && typeof emoji !== 'string') return null;

  return emoji === undefined ? { color } : { emoji, color };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
