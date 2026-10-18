/**
 * What Insert › Picture accepts: the types every output (page, PDF, DOCX) can draw, and a size
 * cap. Sizing is the editor's (InsertImageFitted fits a picture to the column, never up).
 */

/** The picture types every output (page, PDF, DOCX) can draw. */
export const PICTURE_TYPES: readonly string[] = ['image/png', 'image/jpeg'];

/** The largest file handed to the editor: a picture past this is a photo to resize first, and it is held in the worker's memory. */
export const MAX_PICTURE_BYTES: number = 20 * 1_048_576;
