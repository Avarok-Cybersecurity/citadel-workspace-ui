/**
 * The session's local copy of its document (the DocumentCache port, or none): read once on
 * open, removed when the node is gone or no longer readable. A failure is reported, never
 * thrown: without the copy the document is pulled whole, and a copy that could not be
 * removed is said so.
 */
import type { CachedDocument, DocumentSessionPorts } from './ports';
import type { DocumentSessionProblem } from './session-errors';

export class CachedCopy {
  constructor(
    private readonly nodeId: string,
    private readonly cache: DocumentSessionPorts['cache'],
    private readonly report: (problem: DocumentSessionProblem) => void,
  ) {}

  async load(): Promise<CachedDocument | null> {
    if (!this.cache) return null;
    try {
      return await this.cache.load(this.nodeId);
    } catch (cause: unknown) {
      this.report({ kind: 'cacheFailed', operation: 'read', cause });
      return null;
    }
  }

  /** The node is gone or no longer ours to read: its decrypted copy leaves this device. */
  async forget(): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.forget(this.nodeId);
    } catch (cause: unknown) {
      this.report({ kind: 'cacheFailed', operation: 'forget', cause });
    }
  }
}
