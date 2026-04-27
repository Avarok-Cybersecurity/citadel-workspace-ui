import { describe, it, expect } from 'vitest';
import { mapWasmMember } from '../member-mapping';

/**
 * Unit tests for `mapWasmMember`. The mapping is the single normalisation
 * boundary between the raw WASM `User` shape (`{ name, ... }`) and the
 * UI's expected `{ username, displayName, ... }` shape, so any silent
 * field drop here ripples into "members vanish from the sidebar"
 * symptoms downstream.
 */
describe('mapWasmMember', () => {
  it('preserves a fully-populated record verbatim in the canonical fields', () => {
    const out = mapWasmMember({
      id: 'user-1',
      username: 'alice',
      displayName: 'Alice Anderson',
      role: 'admin',
      name: 'should-not-shadow-username',
    });
    expect(out.id).toBe('user-1');
    expect(out.username).toBe('alice');
    expect(out.displayName).toBe('Alice Anderson');
    expect(out.role).toBe('admin');
  });

  it('falls back to `name` for both username and displayName when those are missing', () => {
    const out = mapWasmMember({ id: 'u', name: 'bob' });
    expect(out.username).toBe('bob');
    expect(out.displayName).toBe('bob');
  });

  it('falls back to id when neither name nor username is present', () => {
    const out = mapWasmMember({ id: 'u-7' });
    expect(out.username).toBe('u-7');
    expect(out.displayName).toBe('u-7');
  });

  it('returns an empty object-shape with empty strings rather than crashing on {}', () => {
    const out = mapWasmMember({});
    expect(out.id).toBeUndefined();
    expect(out.username).toBe('');
    expect(out.displayName).toBe('');
    expect(out.role).toBeUndefined();
  });

  it('coerces a numeric id to string instead of dropping it', () => {
    // Regression: the original implementation guarded on `typeof raw.id ===
    // 'string'` and silently set id: undefined for numeric ids, which the
    // downstream `if (!id)` filter then dropped from the member list.
    const out = mapWasmMember({ id: 42, username: 'eve' });
    expect(out.id).toBe('42');
    expect(out.username).toBe('eve');
  });

  it('coerces a bigint id to string', () => {
    const out = mapWasmMember({ id: 12345678901234567890n, username: 'frank' });
    expect(out.id).toBe('12345678901234567890');
  });

  it('drops obviously bogus id types (boolean, object) rather than coercing them', () => {
    const out = mapWasmMember({ id: true, username: 'g' });
    expect(out.id).toBeUndefined();
    expect(out.username).toBe('g');
  });

  it('preserves arbitrary extra fields unchanged via the spread', () => {
    const out = mapWasmMember({ id: 'u', name: 'x', joined_at: 12345, online: true });
    expect((out as Record<string, unknown>).joined_at).toBe(12345);
    expect((out as Record<string, unknown>).online).toBe(true);
  });
});
