/**
 * The reconnect budget must be per-outage, and the modal must close on success.
 *
 * `maxRetries` reads as a per-outage budget, but `reset` was never called — the
 * destructure omitted it — so the attempt count accumulated across the tab's
 * entire lifetime. After ten failures spread over hours, every subsequent
 * disconnection opened a modal reading "Failed to reconnect after 10 attempts"
 * with Retry already disabled and no recovery but a reload. Even before
 * exhaustion, each outage inherited the previous count and started at an
 * inflated backoff.
 *
 * Separately, the close-on-success listener waited for `connection-success`,
 * which NOTHING emits — the socket layer emits `on-ws-connection-success` — so a
 * connection recovered by any other path never closed the modal.
 *
 * Asserted on the source with comments stripped, and cross-checked against the
 * emitter: a listener naming an event nobody fires is exactly the defect here,
 * so the test must confirm the name exists on the other side too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const stripComments = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const modal = stripComments(
  readFileSync(join(process.cwd(), 'src/components/ConnectionRetryModal.tsx'), 'utf8')
);

/** Every event name the websocket layer actually emits. */
function emittedEvents(): Set<string> {
  const dir = join(process.cwd(), 'src/lib/websocket');
  const names = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const m of src.matchAll(/emit\('([\w:-]+)'/g)) names.add(m[1]!);
  }
  return names;
}

describe('the reconnect modal', () => {
  it('listens for an event that is actually emitted', () => {
    const listened = modal.match(/useEventListener\('([\w:-]+)'/)?.[1];

    expect(listened).toBeDefined();
    expect(
      emittedEvents(),
      `the modal listens for '${listened}', which the websocket layer never emits`
    ).toContain(listened!);
  });

  it('resets the attempt budget when the connection comes back', () => {
    const listener = modal.slice(modal.indexOf('useEventListener('));
    expect(listener.slice(0, 200)).toMatch(/reset/i);
  });

  it('actually destructures reset from useRetry', () => {
    // It was omitted, so `reset` existed and could never be called.
    expect(modal).toMatch(/reset:\s*\w+,?\s*\n?\s*\} = useRetry/);
  });
});
