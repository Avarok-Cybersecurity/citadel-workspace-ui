/**
 * The claim email's link is read strictly: one of its two shapes, or nothing.
 *
 * A link is attacker-reachable: anyone can send one. It may carry nothing beyond what the
 * control plane puts in it, and never a server address.
 *
 * No mocks: a pure parser.
 */
import { describe, it, expect } from 'vitest';
import { parseClaimLink } from '../claim-link';

const CODE: string = 'a'.repeat(64);
const TOKEN: string = 'b'.repeat(64);

describe('the claim link', () => {
  it('reads a claim, and a not-me', () => {
    expect(parseClaimLink(`#slug=acme&code=${CODE}&v=${TOKEN}`)).toEqual({ kind: 'claim', slug: 'acme', code: CODE, token: TOKEN });
    expect(parseClaimLink(`#slug=acme&not-me=${TOKEN}`)).toEqual({ kind: 'not-me', slug: 'acme', token: TOKEN });
  });

  it('refuses anything else, whole', () => {
    for (const bad of [
      '',
      `#slug=acme&code=${CODE}`,
      `#slug=acme&code=${CODE}&v=${TOKEN}&server=evil.example`,
      `#slug=acme&code=${CODE}&v=${TOKEN}&slug=other`,
      `#slug=Acme!&code=${CODE}&v=${TOKEN}`,
      `#slug=acme&code=nothex&v=${TOKEN}`,
      `#slug=acme&not-me=${TOKEN}&code=${CODE}`,
    ]) {
      expect(parseClaimLink(bad), bad).toBeNull();
    }
  });
});
