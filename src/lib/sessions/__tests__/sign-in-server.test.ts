/**
 * Which server a Connect names (sign-in-server.ts): the agent's account of that
 * username, in the agent's spelling, and only when it is on the scoped server.
 */
import { describe, expect, it } from 'vitest';
import { requireSignInServer, signInServer, signInServerReasonOf, SignInServerRefusal } from '../sign-in-server';

const AGENT: { username: string; server: string }[] = [
  { username: 'alice', server: 'bench.work.avarok.net' },
  { username: 'bob', server: '10.0.0.7:12349' },
];

describe('the server a sign-in names', () => {
  it('is the agent’s account’s, in its spelling, however the scope is written', () => {
    expect(signInServer(AGENT, ' alice ', 'wss://Bench.work.avarok.net/')).toEqual({ kind: 'server', server: 'bench.work.avarok.net' });
    expect(signInServer(AGENT, 'bob', null)).toEqual({ kind: 'server', server: '10.0.0.7:12349' });
  });

  it('is refused when the account is on another server than the scope', () => {
    expect(signInServer(AGENT, 'alice', 'acme.work.avarok.net')).toEqual({ kind: 'elsewhere', server: 'bench.work.avarok.net' });
    expect(() => requireSignInServer(AGENT, 'alice', 'acme.work.avarok.net')).toThrow(SignInServerRefusal);
  });

  it('is refused when the agent holds no account of that name', () => {
    let refusal: unknown = null;
    try { requireSignInServer(AGENT, 'carol', null); } catch (error: unknown) { refusal = error; }
    expect(refusal).toBeInstanceOf(SignInServerRefusal);
    expect((refusal as SignInServerRefusal).reason).toBe('no_such_account');
  });

  it('reads the agent’s two refusal codes and nothing else', () => {
    expect(signInServerReasonOf('account_on_another_server')).toBe('account_on_another_server');
    expect(signInServerReasonOf('no_such_account')).toBe('no_such_account');
    expect(signInServerReasonOf('admission_required')).toBeNull();
    expect(signInServerReasonOf(null)).toBeNull();
  });
});
