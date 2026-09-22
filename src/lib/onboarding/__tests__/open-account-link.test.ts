import { describe, it, expect } from 'vitest';
import { openAccountLink, type AccountLinkIO, type LinkableSession } from '../open-account-link';
import type { AccountLink } from '../account-link';

/**
 * The flow behind an account link, with the agent's session list and the two
 * outcomes recorded rather than mocked: `io` is the page's I/O boundary, and
 * the decision between switching and signing in is the production code under
 * test.
 */
interface Session extends LinkableSession { cid: bigint }

interface Recorder {
  io: AccountLinkIO<Session>;
  switched: Session[];
  loginFor: string[];
}

function record(ok: boolean, sessions: Session[]): Recorder {
  const switched: Session[] = [];
  const loginFor: string[] = [];
  return {
    switched,
    loginFor,
    io: {
      listSessions: async () => ({ ok, sessions }),
      switchTo: async (session: Session): Promise<void> => { switched.push(session); },
      login: (username: string): void => { loginFor.push(username); },
    },
  };
}

const alice: Session = { cid: 11n, username: 'alice', server_address: 'citadel.example.com:12400' };
const aliceTenant: Session = { cid: 12n, username: 'alice', server_address: 'acme.work.avarok.net' };
const bob: Session = { cid: 21n, username: 'bob', server_address: 'citadel.example.com:12400' };

async function open(link: AccountLink, rec: Recorder): Promise<void> {
  await openAccountLink(link, rec.io);
}

describe('opening an account link', () => {
  it('switches to the live session the link names', async () => {
    const rec: Recorder = record(true, [bob, alice]);
    await open({ username: 'alice' }, rec);
    expect(rec.switched).toEqual([alice]);
    expect(rec.loginFor).toEqual([]);
  });

  it('matches the server when given, with the assumed port', async () => {
    const rec: Recorder = record(true, [alice, aliceTenant]);
    await open({ username: 'alice', server: 'CITADEL.example.com' }, rec);
    expect(rec.switched).toEqual([alice]);
  });

  it('opens sign-in pre-filled when no session matches', async () => {
    const rec: Recorder = record(true, [bob]);
    await open({ username: 'alice' }, rec);
    expect(rec.switched).toEqual([]);
    expect(rec.loginFor).toEqual(['alice']);
  });

  it('does not switch across servers', async () => {
    const rec: Recorder = record(true, [alice]);
    await open({ username: 'alice', server: 'other.example.com' }, rec);
    expect(rec.switched).toEqual([]);
    expect(rec.loginFor).toEqual(['alice']);
  });

  it('does not guess between two sessions with the same username', async () => {
    const rec: Recorder = record(true, [alice, aliceTenant]);
    await open({ username: 'alice' }, rec);
    expect(rec.switched).toEqual([]);
    expect(rec.loginFor).toEqual(['alice']);
  });

  it('never switches on an unanswered session query', async () => {
    const rec: Recorder = record(false, [alice]);
    await open({ username: 'alice' }, rec);
    expect(rec.switched).toEqual([]);
    expect(rec.loginFor).toEqual(['alice']);
  });
});
