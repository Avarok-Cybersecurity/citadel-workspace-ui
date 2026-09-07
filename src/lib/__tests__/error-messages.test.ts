import { describe, it, expect } from 'vitest';
import { getUserFriendlyErrorMessage, getErrorTitle } from '../error-messages';

describe('a missing LOCAL account is not reported as a missing server account', () => {
  /**
   * `ConnectFailure { message: "Client does not exist" }` is what the SDK's own
   * account manager answers when this machine holds no account by that name. It
   * is decided before the server is consulted, and it says nothing whatever
   * about the server.
   *
   * Measured against the live deployment: a real, registered account signed in
   * from a fresh agent `--data-dir` -- a new machine, or a reinstall -- got
   * exactly that, and the UI told the user "No account found with that username
   * on this server. Please check your username or register a new account."
   *
   * Both halves of that are wrong in the way that matters. The account is
   * intact on the server, and registering again is not a retry: it mints a NEW
   * CID while every peer's registration still points at the old one. The user
   * would follow the instruction and quietly split their identity in two.
   */
  it('names the machine, not the server', () => {
    const msg: string = getUserFriendlyErrorMessage('Client does not exist');
    expect(msg).toMatch(/machine/i);
    expect(msg).toMatch(/data.directory|--data-dir/i);
    // The claim that must not be made.
    expect(msg).not.toMatch(/on this server/i);
  });

  it('does not tell them to register, which would split their identity', () => {
    const msg: string = getUserFriendlyErrorMessage('Client does not exist');
    expect(msg).not.toMatch(/register a new account/i);
    // ...while still saying what registering again would COST, so the option is
    // informed rather than hidden.
    expect(msg).toMatch(/separate account/i);
  });

  it('still reports a genuinely unknown username the old way', () => {
    // The generic branch must survive: this one is about a different failure.
    const msg: string = getUserFriendlyErrorMessage('User is not registered');
    expect(msg).toMatch(/on this server/i);
  });
});

describe('getUserFriendlyErrorMessage', () => {
  it('handles WebSocket connection failures', () => {
    const msg: string = getUserFriendlyErrorMessage('WebSocket connection failed');
    expect(msg).toContain('Citadel agent');
    // Not "check your internet connection". This socket is same-origin /ws to
    // the local agent, so that advice sends the user somewhere that cannot
    // help — and real network loss is already handled by OfflineBanner.
    expect(msg.toLowerCase()).not.toContain('internet');
  });

  it('handles WASM client init failure', () => {
    const msg: string = getUserFriendlyErrorMessage('Failed to initialize WASM client');
    expect(msg).toContain('Citadel agent');
    expect(msg.toLowerCase()).not.toContain('internet');
  });

  it('handles handshake closed', () => {
    const msg: string = getUserFriendlyErrorMessage('Connection closed before receiving a handshake');
    expect(msg).toContain('not responding');
  });

  it('handles session already connected', () => {
    const msg: string = getUserFriendlyErrorMessage('Session Already Connected');
    expect(msg).toContain('already connected');
  });

  it('handles timeout', () => {
    const msg: string = getUserFriendlyErrorMessage('Request timed out');
    expect(msg).toContain('timed out');
  });

  it('handles invalid credentials', () => {
    const msg: string = getUserFriendlyErrorMessage('Invalid credentials');
    expect(msg).toContain('Invalid username or password');
  });

  it('handles user not found', () => {
    const msg: string = getUserFriendlyErrorMessage('User not found');
    expect(msg).toContain('No account found');
  });

  it('handles user already exists', () => {
    const msg: string = getUserFriendlyErrorMessage('User already exists');
    expect(msg).toContain('already exists');
  });

  it('handles workspace not found', () => {
    const msg: string = getUserFriendlyErrorMessage('Workspace not found');
    expect(msg).toContain('could not be found');
  });

  it('handles connection refused', () => {
    const msg: string = getUserFriendlyErrorMessage('Connection refused (ECONNREFUSED)');
    expect(msg).toContain('Could not reach');
  });

  it('handles Error objects', () => {
    const msg: string = getUserFriendlyErrorMessage(new Error('WebSocket connection failed'));
    expect(msg).toContain('Citadel agent');
  });

  it('returns cleaned message for unknown short errors', () => {
    const msg: string = getUserFriendlyErrorMessage('Something weird happened');
    expect(msg).toContain('Something went wrong');
    expect(msg).toContain('Something weird happened');
  });

  it('returns generic message for very long unknown errors', () => {
    const longMsg: string = 'x'.repeat(300);
    const msg: string = getUserFriendlyErrorMessage(longMsg);
    expect(msg).toContain('unexpected error');
  });

  it('maps the SDK\'s real duplicate-username message, not just the literal', () => {
    // Captured verbatim from the live toast. The mapping used to test for
    // 'User already exists', which this does not contain, so the friendliest
    // message in the file was unreachable for the case it was written for.
    expect(getUserFriendlyErrorMessage('Username bob_1787715650505 already exists!')).toMatch(
      /already exists.*choose a different username/i,
    );
    // The older phrasing must keep working.
    expect(getUserFriendlyErrorMessage('User already exists')).toMatch(
      /already exists.*choose a different username/i,
    );
    // Unrelated "already exists" errors must NOT be reported as a username clash.
    expect(getUserFriendlyErrorMessage('Workspace already exists')).not.toMatch(
      /choose a different username/i,
    );
  });
});

describe('getErrorTitle', () => {
  it('returns Connection Error for WebSocket issues', () => {
    expect(getErrorTitle('WebSocket broke')).toBe('Connection Error');
    expect(getErrorTitle('ECONNREFUSED')).toBe('Connection Error');
  });

  it('returns Authentication Error for credential issues', () => {
    expect(getErrorTitle('password mismatch')).toBe('Authentication Error');
    expect(getErrorTitle('Invalid Password')).toBe('Authentication Error');
  });

  it('returns Workspace Error for workspace issues', () => {
    expect(getErrorTitle('Workspace init failed')).toBe('Workspace Error');
  });

  it('returns Network Error for network issues', () => {
    expect(getErrorTitle('NetworkError')).toBe('Network Error');
  });

  it('returns Request Timeout for timeouts', () => {
    expect(getErrorTitle('Request timeout')).toBe('Request Timeout');
  });

  it('returns Account Not Found for missing accounts', () => {
    expect(getErrorTitle('User not found')).toBe('Account Not Found');
    expect(getErrorTitle('not registered')).toBe('Account Not Found');
  });

  it('returns generic Error for unknown messages', () => {
    expect(getErrorTitle('Something unexpected')).toBe('Error');
  });

  it('handles Error objects', () => {
    expect(getErrorTitle(new Error('Connection refused'))).toBe('Connection Error');
  });
  it('titles a duplicate username instead of the bare "Error" fallback', () => {
    expect(getErrorTitle('Username bob_1787715650505 already exists!')).toBe('Username Taken');
  });
});

describe('credential errors are matched regardless of case', () => {
  // The SDK emits `#[form = "Invalid password"]` with a capital I
  // (citadel_io/src/error/code.rs). These branches were all-lowercase
  // `.includes()` needles, and `.includes()` is case-sensitive — so the branch
  // handling the product's most common error could never fire, and a mistyped
  // password fell through to "Something went wrong: Invalid password".
  it.each([
    'Invalid password',
    'invalid password',
    'Login failure: Invalid password',
  ])('maps %j to the friendly message', (raw) => {
    expect(getUserFriendlyErrorMessage(raw)).toBe(
      'Incorrect password. Please check your password and try again.',
    );
  });

  it('maps the SDK capitalisation of a missing account', () => {
    expect(getUserFriendlyErrorMessage('Account Does Not Exist')).toContain('No account found');
  });

  it('still leaves unrelated errors to the fallback', () => {
    // Guards against a matcher so loose it swallows everything.
    expect(getUserFriendlyErrorMessage('Disk quota exceeded')).not.toContain('Incorrect password');
  });
});

describe('an error that is neither a string nor an Error', () => {
  it('never becomes "[object Object]" in front of a user', () => {
    // Login, registration and workspace initialization each narrowed with
    // `err instanceof Error ? err : String(err)` before calling this, and the
    // revfs and websocket layers both reject with a structured payload. That
    // string matched no branch, was not jargon and was under 200 characters,
    // so it reached the user through the passthrough.
    const shown: string = getUserFriendlyErrorMessage({ code: 5, detail: 'x' });

    expect(shown).not.toContain('[object Object]');
  });

  it('still recognises a known failure carried on a payload', () => {
    // The positive control: normalising must not cost the mapping. Without
    // this, returning a constant would satisfy the test above.
    expect(getUserFriendlyErrorMessage({ message: 'Invalid credentials' })).toMatch(
      /invalid username or password/i,
    );
  });

  it('titles it without [object Object] either', () => {
    expect(getErrorTitle({ code: 5 })).not.toContain('[object Object]');
  });
});
