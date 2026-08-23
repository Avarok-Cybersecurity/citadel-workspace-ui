import { describe, it, expect, vi } from 'vitest';
import { yieldToEventLoop, waitFor, waitForEvent } from '../scheduling';

describe('yieldToEventLoop', () => {
  it('yields as a macrotask, so the browser gets a chance to paint', async () => {
    // The distinction this helper exists for: an awaited promise is a MICROtask
    // and runs before the browser renders, so a loop of them starves paint. A
    // macrotask lets rendering in. Ordering proves which one we got.
    const order: string[] = [];
    void Promise.resolve().then(() => order.push('microtask'));
    const macro = new Promise<void>(r => setTimeout(() => { order.push('macrotask'); r(); }, 0));
    await yieldToEventLoop();
    await macro;
    expect(order).toEqual(['microtask', 'macrotask']);
  });

  it('adds no measurable delay of its own', async () => {
    const start = Date.now();
    await yieldToEventLoop();
    // Was a hardcoded 10ms per file-transfer chunk. Anything in that ballpark
    // means the arbitrary delay crept back in.
    expect(Date.now() - start).toBeLessThan(10);
  });
});

describe('waitFor', () => {
  it('returns immediately when the condition already holds', async () => {
    const start = Date.now();
    await expect(waitFor(() => true, { timeoutMs: 1000, description: 'always true' }))
      .resolves.toBe(true);
    // The whole point: a helper that always cost one poll interval would just be
    // a slower sleep.
    expect(Date.now() - start).toBeLessThan(20);
  });

  it('returns as soon as the condition flips, not when the timeout elapses', async () => {
    let ready = false;
    setTimeout(() => { ready = true; }, 30);
    const start = Date.now();
    await waitFor(() => ready, { timeoutMs: 5000, intervalMs: 5, description: 'ready flag' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(elapsed).toBeLessThan(500); // nowhere near the 5s ceiling
  });

  it('accepts an async condition', async () => {
    let calls = 0;
    await expect(
      waitFor(async () => ++calls >= 3, { timeoutMs: 1000, intervalMs: 1, description: 'third call' })
    ).resolves.toBe(true);
    expect(calls).toBe(3);
  });

  it('names what it was waiting for when it times out', async () => {
    // A silent continue-into-a-broken-state is exactly what the fixed sleeps did.
    await expect(
      waitFor(() => false, { timeoutMs: 20, intervalMs: 5, description: 'peer channel ready' })
    ).rejects.toThrow(/waiting for: peer channel ready/);
  });

  it('can report failure without throwing, for best-effort settling', async () => {
    await expect(
      waitFor(() => false, { timeoutMs: 20, intervalMs: 5, description: 'optional', resolveOnTimeout: true })
    ).resolves.toBe(false);
  });

  it('does not overshoot its own deadline while polling', async () => {
    const start = Date.now();
    await waitFor(() => false, {
      timeoutMs: 30,
      intervalMs: 100, // deliberately longer than the timeout
      description: 'never',
      resolveOnTimeout: true,
    });
    // The final sleep is clamped to the remaining budget, so a coarse interval
    // cannot stretch a 30ms wait into a 100ms one.
    expect(Date.now() - start).toBeLessThan(90);
  });
});

describe('waitForEvent', () => {
  it('resolves with the emitted value and unsubscribes', async () => {
    const unsubscribe = vi.fn();
    const promise = waitForEvent<string>(resolve => {
      setTimeout(() => resolve('connected'), 10);
      return unsubscribe;
    }, { timeoutMs: 1000, description: 'peer connect' });

    await expect(promise).resolves.toBe('connected');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on timeout too, so a listener cannot leak', async () => {
    const unsubscribe = vi.fn();
    const promise = waitForEvent(() => unsubscribe, { timeoutMs: 20, description: 'never fires' });

    await expect(promise).rejects.toThrow(/waiting for: never fires/);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores a second emission rather than settling twice', async () => {
    const unsubscribe = vi.fn();
    let emit!: (v: string) => void;
    const promise = waitForEvent<string>(resolve => { emit = resolve; return unsubscribe; },
      { timeoutMs: 1000, description: 'double emit' });

    emit('first');
    emit('second');

    await expect(promise).resolves.toBe('first');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
