/**
 * Merkle Tree - Revision Chain
 *
 * Hash chain for revision history with blockchain-like integrity verification.
 */

import type { RevisionEntry } from './types';

// ============================================
// REVISION CHAIN
// ============================================

/**
 * Hash chain for revision history
 * Provides blockchain-like integrity verification
 */
export class RevisionChain {
  private entries: RevisionEntry[] = [];
  private maxLength: number;

  constructor(maxLength: number = 100) {
    this.maxLength = maxLength;
  }

  /**
   * Add a new revision to the chain
   */
  addRevision(rootHash: string): RevisionEntry {
    const prevHash: string | undefined = this.entries.length > 0
      ? this.entries[this.entries.length - 1].rootHash
      : undefined;

    const entry: RevisionEntry = {
      revision: this.entries.length,
      rootHash,
      timestamp: Date.now(),
      prevHash,
    };

    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.maxLength) {
      this.entries = this.entries.slice(-this.maxLength);
    }

    return entry;
  }

  /**
   * Get latest revision
   */
  getLatest(): RevisionEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /**
   * Get revision by number
   */
  getRevision(revision: number): RevisionEntry | undefined {
    return this.entries.find(e => e.revision === revision);
  }

  /**
   * Find common ancestor revision with remote chain
   */
  findCommonAncestor(remoteEntries: RevisionEntry[]): RevisionEntry | undefined {
    const remoteHashes: Set<string> = new Set(remoteEntries.map(e => e.rootHash));

    // Search from most recent
    for (let i: number = this.entries.length - 1; i >= 0; i--) {
      if (remoteHashes.has(this.entries[i].rootHash)) {
        return this.entries[i];
      }
    }

    return undefined;
  }

  /**
   * Get all entries since a revision
   */
  getEntriesSince(revision: number): RevisionEntry[] {
    return this.entries.filter(e => e.revision > revision);
  }

  /**
   * Export chain for transmission
   */
  export(): RevisionEntry[] {
    return [...this.entries];
  }

  /**
   * Import chain (replaces current)
   */
  import(entries: RevisionEntry[]): void {
    this.entries = [...entries].slice(-this.maxLength);
  }

  /**
   * Verify chain integrity
   */
  verifyIntegrity(): boolean {
    for (let i: number = 1; i < this.entries.length; i++) {
      if (this.entries[i].prevHash !== this.entries[i - 1].rootHash) {
        return false;
      }
    }
    return true;
  }
}
