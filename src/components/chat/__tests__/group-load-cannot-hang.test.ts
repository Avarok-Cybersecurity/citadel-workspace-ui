/**
 * A failed group-message load must not leave a permanent spinner.
 *
 * `getGroupMessages` resolves when the request is SENT, and `loading` is cleared
 * ONLY by the `messages_loaded` event — with no error branch for a refused or
 * lost response. So the chat spun forever with nothing to press, and the only
 * escape was navigating away or reloading.
 *
 * The pagination case is worse: "Load older messages" is `disabled={loadingMore}`,
 * so one lost response disabled it permanently for the rest of the session.
 *
 * Asserted on the source with comments stripped. The deadline helper has its own
 * behavioural tests; what this covers is the WIRING, which those cannot see —
 * removing the arm/cancel calls leaves the helper's tests entirely green.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The hook's code, without prose — a source assertion must read code. */
const hook: string = readFileSync(join(process.cwd(), 'src/components/chat/useGroupChat.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('a group-message load', () => {
  it('arms a deadline for the initial load', () => {
    expect(hook).toMatch(/armLoadingDeadline\(`group-messages:\$\{groupId\}`/);
  });

  it('arms one for pagination too, which disables a button while pending', () => {
    expect(hook).toMatch(/armLoadingDeadline\(`group-messages-more:\$\{groupId\}`/);
  });

  it('cancels both when the response arrives', () => {
    const onLoaded: string = hook.slice(hook.indexOf("case 'messages_loaded'"));
    expect(onLoaded).toMatch(/cancelLoadingDeadline\(`group-messages:/);
    expect(onLoaded).toMatch(/cancelLoadingDeadline\(`group-messages-more:/);
  });

  it('clears the flag from the deadline, not just from the event', () => {
    // The point of the deadline is that it clears the SAME flag the event
    // clears. Arming one that did nothing would satisfy the assertions above.
    const armed: string = hook.slice(hook.indexOf('armLoadingDeadline(`group-messages:'));
    expect(armed.slice(0, 120)).toMatch(/setLoading\(false\)/);
  });
});
