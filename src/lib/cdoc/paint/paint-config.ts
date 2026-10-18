/**
 * The painter's settings, stated once for both renderers (main thread and worker).
 *
 * Atlas: four cell classes on 1024px surfaces, created on first use: 4096 cells of 16px (body
 * text up to ~11px glyph height), 1024 of 32px, 256 of 64px, 64 of 128px; larger glyphs are
 * filled from their path. At most 4 × 4 MB of surface, and only for the classes a document uses.
 *
 * Paper is the sheet's colour, the document's and not the theme's: a page is white in dark mode
 * as it is on paper, as in every word processor. The missing-image stroke marks an image whose
 * bytes this view does not have yet (images arrive with the document-content work item).
 */
import type { RasterizerOptions } from './page-rasterizer';
import type { OverlayStyle } from './overlay-painter';

export const RASTERIZER_OPTIONS: RasterizerOptions = {
  atlas: { cellSizes: [16, 32, 64, 128], surfaceSide: 1024 },
  paper: '#ffffff',
  missingImageStroke: '#c8c8c8',
};

/** How long a face fetch may take before the open fails instead of hanging. */
export const FONT_FETCH_TIMEOUT_MS: number = 30_000;

/**
 * The selection and caret overlays. Concrete colours, because a canvas cannot read CSS
 * variables, and the sheet is white in both themes: Word's selection blue at 30%, a black caret.
 */
export const OVERLAY_STYLE: OverlayStyle = {
  selection: 'rgba(38, 132, 255, 0.3)',
  caret: '#000000',
  caretCssPx: 1,
  peerSelectionAlpha: 0.25,
  labelCssPx: 11,
  labelFamily: 'system-ui, sans-serif',
  labelText: '#ffffff',
};
