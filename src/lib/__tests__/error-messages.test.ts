import { describe, it, expect } from 'vitest';
import { getUserFriendlyErrorMessage, getErrorTitle } from '../error-messages';

describe('getUserFriendlyErrorMessage', () => {
  it('handles WebSocket connection failures', () => {
    const msg = getUserFriendlyErrorMessage('WebSocket connection failed');
    expect(msg).toContain('Unable to connect');
  });

  it('handles WASM client init failure', () => {
    const msg = getUserFriendlyErrorMessage('Failed to initialize WASM client');
    expect(msg).toContain('Unable to connect');
  });

  it('handles handshake closed', () => {
    const msg = getUserFriendlyErrorMessage('Connection closed before receiving a handshake');
    expect(msg).toContain('not responding');
  });

  it('handles session already connected', () => {
    const msg = getUserFriendlyErrorMessage('Session Already Connected');
    expect(msg).toContain('already connected');
  });

  it('handles timeout', () => {
    const msg = getUserFriendlyErrorMessage('Request timed out');
    expect(msg).toContain('timed out');
  });

  it('handles invalid credentials', () => {
    const msg = getUserFriendlyErrorMessage('Invalid credentials');
    expect(msg).toContain('Invalid username or password');
  });

  it('handles user not found', () => {
    const msg = getUserFriendlyErrorMessage('User not found');
    expect(msg).toContain('No account found');
  });

  it('handles user already exists', () => {
    const msg = getUserFriendlyErrorMessage('User already exists');
    expect(msg).toContain('already exists');
  });

  it('handles workspace not found', () => {
    const msg = getUserFriendlyErrorMessage('Workspace not found');
    expect(msg).toContain('could not be found');
  });

  it('handles connection refused', () => {
    const msg = getUserFriendlyErrorMessage('Connection refused (ECONNREFUSED)');
    expect(msg).toContain('Could not reach');
  });

  it('handles Error objects', () => {
    const msg = getUserFriendlyErrorMessage(new Error('WebSocket connection failed'));
    expect(msg).toContain('Unable to connect');
  });

  it('returns cleaned message for unknown short errors', () => {
    const msg = getUserFriendlyErrorMessage('Something weird happened');
    expect(msg).toContain('Something went wrong');
    expect(msg).toContain('Something weird happened');
  });

  it('returns generic message for very long unknown errors', () => {
    const longMsg = 'x'.repeat(300);
    const msg = getUserFriendlyErrorMessage(longMsg);
    expect(msg).toContain('unexpected error');
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
});
