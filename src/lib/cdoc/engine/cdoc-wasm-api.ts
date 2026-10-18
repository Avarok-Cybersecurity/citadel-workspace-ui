/**
 * The part of the cdoc-wasm glue the engine calls, typed from the generated declarations. The
 * engine is handed an initialised module rather than importing the glue, so loading it (fetch
 * in the browser, file bytes under node) stays in the adapters.
 */
import type * as Glue from '../../../../vendor/cdoc/cdoc_wasm.js';

export type CdocWasm = Pick<
  typeof Glue,
  | 'RenderAssets' | 'blank_pm_json' | 'model_to_pm' | 'pm_to_display_list' | 'glyph_path' | 'face_metrics' | 'version'
  | 'EditorFonts' | 'EditorHandle'
  | 'ImageStore' | 'docx_to_pm' | 'odt_to_pm' | 'md_to_pm' | 'txt_to_pm' | 'pm_to_docx' | 'pm_to_odt' | 'pm_to_md' | 'pm_to_txt' | 'pm_to_pdf'
>;

export type RenderAssets = Glue.RenderAssets;
export type EditorHandle = Glue.EditorHandle;
export type EditorSealedFonts = Glue.EditorSealedFonts;
export type ImageStore = Glue.ImageStore;
export type FileExport = Glue.FileExport;
