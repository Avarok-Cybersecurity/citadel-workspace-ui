/**
 * Runs a session's steps one at a time in arrival order. A CRDT update must reach the editor
 * after the ones before it, and an answer handled while an earlier one is still awaiting the
 * worker would read the cursor before it moved.
 */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly report: (error: unknown) => void) {}

  run(step: () => Promise<void>): Promise<void> {
    const next: Promise<void> = this.tail.then(step).catch((error: unknown): void => this.report(error));
    this.tail = next;
    return next;
  }

  /** Resolves once every step queued so far has run. */
  idle(): Promise<void> {
    return this.tail;
  }
}
