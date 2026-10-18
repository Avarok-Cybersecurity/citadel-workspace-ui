/**
 * How a chosen picture is sized for InsertImage: its pixel size at 96 dpi (one CSS px is
 * 3/4 pt, 75 Pt100), scaled down, never up, to fit the widest text column a blank document
 * has (A4 less Word's default 1-inch margins), keeping its aspect ratio.
 */
import type { Pt100 } from '@/lib/cdoc/editor/model-values';

/** The picture types every output (page, PDF, DOCX) can draw. */
export const PICTURE_TYPES: readonly string[] = ['image/png', 'image/jpeg'];

const PT100_PER_PX: number = 75;
/** A4's 595.3 pt width less two 72 pt margins. */
export const MAX_PICTURE_WIDTH: Pt100 = 45130;

export function pictureSize(px: { readonly width: number; readonly height: number }): { readonly width: Pt100; readonly height: Pt100 } {
  if (!(px.width > 0 && px.height > 0)) throw new Error('the picture has no size');
  const width: Pt100 = px.width * PT100_PER_PX;
  const scale: number = Math.min(1, MAX_PICTURE_WIDTH / width);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(px.height * PT100_PER_PX * scale)) };
}
