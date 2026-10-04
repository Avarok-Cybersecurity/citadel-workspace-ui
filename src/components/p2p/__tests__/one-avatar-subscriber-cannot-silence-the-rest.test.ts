import { describe, expect, it } from 'vitest';
import { registerAvatarSlot, subscribeToAvatarSlots } from '../cursor-avatar-slots';

describe('avatar slot subscribers', () => {
  it('are each told of a new slot even when an earlier one throws', () => {
    const told: string[] = [];
    const offThrower = subscribeToAvatarSlots(() => {
      throw new Error('a broken subscriber');
    });
    const offWitness = subscribeToAvatarSlots(() => told.push('witness'));

    const remove = registerAvatarSlot(document.createElement('span'), 'alice');
    expect(told).toEqual(['witness']);

    expect(() => remove()).not.toThrow();
    expect(told).toEqual(['witness', 'witness']);

    offThrower();
    offWitness();
  });
});
