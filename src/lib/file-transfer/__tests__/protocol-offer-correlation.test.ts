/**
 * The two halves of a transfer race, so correlation must work in both orders.
 */
import { describe, it, expect, vi } from 'vitest';
import { ProtocolOfferCorrelator } from '../protocol-offer-correlation';

const SENDER: "42" = '42';
const FILE: { name: string; size: number; } = { name: 'report.pdf', size: 8192 };

describe('ProtocolOfferCorrelator', () => {
  it('joins when the bytes are announced first', () => {
    const register = vi.fn();
    const c: ProtocolOfferCorrelator = new ProtocolOfferCorrelator(register);

    c.noteProtocolOffer('90210', SENDER, FILE.name, FILE.size);
    expect(c.noteMessageOffer('uuid-1', SENDER, FILE.name, FILE.size)).toBe(true);

    expect(register).toHaveBeenCalledWith('uuid-1', '90210');
  });

  it('joins when the bubble arrives first', () => {
    const register = vi.fn();
    const c: ProtocolOfferCorrelator = new ProtocolOfferCorrelator(register);

    // On a slow link the protocol notification can trail the message. Dropping
    // the message half here would leave a transfer that can never be accepted —
    // indistinguishable to the user from one that never arrived.
    expect(c.noteMessageOffer('uuid-2', SENDER, FILE.name, FILE.size)).toBe(false);
    expect(register).not.toHaveBeenCalled();

    c.noteProtocolOffer('90211', SENDER, FILE.name, FILE.size);
    expect(register).toHaveBeenCalledWith('uuid-2', '90211');
  });

  it('does not join across senders', () => {
    const register = vi.fn();
    const c: ProtocolOfferCorrelator = new ProtocolOfferCorrelator(register);

    c.noteProtocolOffer('90212', SENDER, FILE.name, FILE.size);
    // Same file name and size from a different peer must not be joined — that
    // would accept one peer's transfer under another peer's offer.
    expect(c.noteMessageOffer('uuid-3', '99', FILE.name, FILE.size)).toBe(false);

    expect(register).not.toHaveBeenCalled();
  });

  it('keeps concurrent transfers from the same sender distinct', () => {
    const register = vi.fn();
    const c: ProtocolOfferCorrelator = new ProtocolOfferCorrelator(register);

    c.noteProtocolOffer('100', SENDER, 'a.bin', 10);
    c.noteProtocolOffer('200', SENDER, 'b.bin', 20);

    c.noteMessageOffer('uuid-b', SENDER, 'b.bin', 20);
    c.noteMessageOffer('uuid-a', SENDER, 'a.bin', 10);

    expect(register).toHaveBeenNthCalledWith(1, 'uuid-b', '200');
    expect(register).toHaveBeenNthCalledWith(2, 'uuid-a', '100');
  });
});
