/**
 * What the ribbons need from the world: the engine takes ids, authors and dates from its
 * caller (cdoc-edit has no clock or randomness), and shortcut labels depend on the platform.
 * The browser adapter is the only place these are read.
 */
export interface RibbonEnvironment {
  /** A comment id no other comment in the document has. */
  newCommentId(): string;
  /** A footnote id (a u32) no other footnote has; the engine refuses a taken one. */
  newFootnoteId(): number;
  /** Now, RFC 3339. */
  now(): string;
  /** A chosen file's bytes. */
  readBytes(file: Blob): Promise<Uint8Array>;
  /** How shortcut labels name the command key. */
  readonly modifier: 'Ctrl' | '⌘';
}

const U32_RANGE: number = 0xffff_ffff;

export function browserRibbonEnvironment(): RibbonEnvironment {
  const mac: boolean = /Mac|iPhone|iPad/.test(navigator.platform);
  return {
    newCommentId: (): string => crypto.randomUUID(),
    // 1 … 2^32-1: zero is left out so an id is never mistaken for "none".
    newFootnoteId: (): number => (crypto.getRandomValues(new Uint32Array(1))[0] % U32_RANGE) + 1,
    now: (): string => new Date().toISOString(),
    readBytes: async (file: Blob): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer()),
    modifier: mac ? '⌘' : 'Ctrl',
  };
}
