/**
 * Every limit and option the browser hands cdoc-wasm, in one place (PCND: the engine takes
 * them as required arguments, so no size is ever an implicit default). Each value is sized
 * for a browser tab, with its reason beside it.
 */

/**
 * The largest image a file may embed and still open (`fromDocument`'s maxImageBytes), and the
 * largest a user may add: 32 MiB, half the 64 MiB the engine allows for one part of a
 * package, so one picture cannot take a document's whole budget.
 */
export const MAX_IMAGE_BYTES: number = 32 * 1024 * 1024;

/**
 * Markdown import, Pt100 (cdoc_md::MdReadOptions; every field required): the blank document's
 * text width, A4 (59530) less two 1-inch margins (7200 each), and for an image with no size
 * that width at 4:3.
 */
export const MD_READ_OPTIONS: { readonly textWidth: number; readonly imageWidth: number; readonly imageHeight: number } = {
  textWidth: 45130,
  imageWidth: 45130,
  imageHeight: 33848,
};

/** Plain-text import: a single newline is a line break, a blank line a new paragraph. */
export const TXT_READ_OPTIONS: { readonly singleNewline: 'break' | 'space' } = { singleNewline: 'break' };
