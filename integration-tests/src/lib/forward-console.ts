import type { Page } from 'playwright';

/**
 * Forward this page's console to the test's own stdout.
 *
 * Diagnostics that only reach the browser console reach NOTHING a CI failure
 * can be read from. `member-promotion.spec.ts` failed on its baseline -- a
 * plain member's Edit button read enabled -- and the one instrument built for
 * exactly that condition, `logOfferedWithoutAnswer`'s "edit offered without an
 * answer", appeared in no artifact the run produced: not the job log (which
 * captures container output, not page console), not the fixture (which had no
 * console listener), and not the trace, whose event types were `before`,
 * `after`, `stdout`, `context-options` and `error` -- zero console entries.
 *
 * `console.log` rather than an in-memory buffer: stdout is the one channel that
 * lands in BOTH the job log and the trace, so the next occurrence names itself
 * wherever the reader happens to look.
 *
 * Errors and warnings only. Forwarding every `log` would bury the signal in the
 * app's own chatter, which is how a diagnostic becomes unread rather than
 * missing -- a different failure with the same outcome.
 */
export function forwardConsole(page: Page, label: string): void {
    page.on('console', (msg): void => {
        const type: string = msg.type();
        if (type !== 'error' && type !== 'warning') return;
        console.log(`  [${label.toUpperCase()}:console.${type}] ${msg.text().slice(0, 500)}`);
    });
    page.on('pageerror', (err: Error): void => {
        console.log(`  [${label.toUpperCase()}:pageerror] ${err.message}`);
    });
}
