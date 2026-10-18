/* tslint:disable */
/* eslint-disable */

/**
 * A written `.docx` and the report of what it could not carry.
 */
export class DocxExport {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The file.
     */
    bytes(): Uint8Array;
    /**
     * The loss report as JSON.
     */
    reportJson(): string;
}

/**
 * Images moving across the boundary: embedded images found by `docx_to_pm` (under
 * provisional ids), and the bytes `pm_to_docx` needs for the ids a document names.
 */
export class ImageStore {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add an image under a content id.
     */
    add(id: string, mime: string, bytes: Uint8Array): void;
    /**
     * The bytes of image `index`.
     */
    bytes(index: number): Uint8Array | undefined;
    /**
     * An empty store.
     */
    constructor();
    /**
     * The content id of image `index`.
     */
    id(index: number): string | undefined;
    /**
     * Whether the store holds no image.
     */
    isEmpty(): boolean;
    /**
     * How many images the store holds.
     */
    len(): number;
    /**
     * The MIME type of image `index`.
     */
    mime(index: number): string | undefined;
}

/**
 * Faces, images and the time a render uses, handed in from JavaScript.
 */
export class RenderAssets {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Adds a face (TrueType or OpenType bytes).
     */
    addFont(family: string, bold: boolean, italic: boolean, bytes: Uint8Array): void;
    /**
     * Adds an image under the content id documents refer to it by.
     */
    addImage(content_id: string, mime: string, bytes: Uint8Array): void;
    /**
     * Serves `target` whenever a document asks for `name` (e.g. Calibri → Carlito).
     */
    aliasFont(name: string, target: string): void;
    /**
     * No faces or images yet. `fallback_family` serves any family not added or aliased;
     * `now_rfc3339` (e.g. `new Date().toISOString()`) is the time the PDF records.
     */
    constructor(fallback_family: string, now_rfc3339: string);
}

/**
 * A blank document as model JSON.
 */
export function blank_model_json(): string;

/**
 * A blank document as ProseMirror JSON.
 */
export function blank_pm_json(): string;

/**
 * Check a ProseMirror JSON tree against the schema; throws naming the first violation.
 */
export function check_pm(pm_json: string): void;

/**
 * A `.docx` to JSON `{"pm", "report", "problems"}`; images go into `images`.
 */
export function docx_to_pm(bytes: Uint8Array, images: ImageStore): string;

/**
 * That face's metrics as the 8-byte record (`unitsPerEm`, ascender, descender, line gap).
 */
export function face_metrics(assets: RenderAssets, family: string, bold: boolean, italic: boolean): Uint8Array;

/**
 * The outline of glyph `glyph_id` in the face a display list's face table names, as a
 * glyph-path record (font units, y up).
 */
export function glyph_path(assets: RenderAssets, family: string, bold: boolean, italic: boolean, glyph_id: number): Uint8Array;

/**
 * The list label of every paragraph, in ProseMirror paragraph order, as a JSON array of
 * strings and nulls.
 */
export function list_labels(pm_json: string): string;

/**
 * Markdown to JSON `{"pm", "report", "problems"}`. Options JSON:
 * `{"textWidth", "imageWidth", "imageHeight"}` in hundredths of a point.
 */
export function md_to_pm(md: string, options_json: string): string;

/**
 * Model JSON → ProseMirror JSON.
 */
export function model_to_pm(model_json: string): string;

/**
 * ProseMirror JSON → the display list of every page: the binary format of
 * `docs/display-list.md`, returned as a `Uint8Array` the caller can transfer to the painter.
 */
export function pm_to_display_list(pm_json: string, assets: RenderAssets): Uint8Array;

/**
 * ProseMirror JSON → a display list of only `pages` (zero-based), for repainting the pages
 * an edit changed.
 */
export function pm_to_display_list_pages(pm_json: string, assets: RenderAssets, pages: Uint32Array): Uint8Array;

/**
 * ProseMirror JSON to a `.docx`; image bytes come from `images`.
 */
export function pm_to_docx(pm_json: string, images: ImageStore): DocxExport;

/**
 * ProseMirror JSON to JSON `{"text", "report"}` holding Markdown.
 */
export function pm_to_md(pm_json: string): string;

/**
 * ProseMirror JSON → model JSON.
 */
export function pm_to_model(pm_json: string): string;

/**
 * ProseMirror JSON → PDF bytes.
 */
export function pm_to_pdf(pm_json: string, assets: RenderAssets): Uint8Array;

/**
 * ProseMirror JSON → a JSON array of SVG page documents for the paged preview.
 */
export function pm_to_svg_pages(pm_json: string, assets: RenderAssets): string;

/**
 * ProseMirror JSON to JSON `{"text", "report"}` holding plain text.
 */
export function pm_to_txt(pm_json: string): string;

/**
 * The ProseMirror schema as JSON.
 */
export function schema_json(): string;

/**
 * Plain text to JSON `{"pm", "report", "problems"}`. Options JSON:
 * `{"singleNewline": "break" | "space"}`.
 */
export function txt_to_pm(text: string, options_json: string): string;

/**
 * Validate a model document; returns a JSON array of error messages, empty when valid.
 */
export function validate_model(model_json: string): string;

/**
 * The crate version, so the UI can log which build it loaded.
 */
export function version(): string;

/**
 * Words in the body of a model document.
 */
export function word_count(model_json: string): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_docxexport_free: (a: number, b: number) => void;
    readonly __wbg_imagestore_free: (a: number, b: number) => void;
    readonly __wbg_renderassets_free: (a: number, b: number) => void;
    readonly blank_model_json: () => [number, number];
    readonly blank_pm_json: () => [number, number];
    readonly check_pm: (a: number, b: number) => [number, number];
    readonly docx_to_pm: (a: number, b: number, c: number) => [number, number, number, number];
    readonly docxexport_bytes: (a: number) => [number, number];
    readonly docxexport_reportJson: (a: number) => [number, number];
    readonly face_metrics: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly glyph_path: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly imagestore_add: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly imagestore_bytes: (a: number, b: number) => [number, number];
    readonly imagestore_empty: () => number;
    readonly imagestore_id: (a: number, b: number) => [number, number];
    readonly imagestore_isEmpty: (a: number) => number;
    readonly imagestore_len: (a: number) => number;
    readonly imagestore_mime: (a: number, b: number) => [number, number];
    readonly list_labels: (a: number, b: number) => [number, number, number, number];
    readonly md_to_pm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly model_to_pm: (a: number, b: number) => [number, number, number, number];
    readonly pm_to_display_list: (a: number, b: number, c: number) => [number, number, number, number];
    readonly pm_to_display_list_pages: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly pm_to_docx: (a: number, b: number, c: number) => [number, number, number];
    readonly pm_to_md: (a: number, b: number) => [number, number, number, number];
    readonly pm_to_model: (a: number, b: number) => [number, number, number, number];
    readonly pm_to_pdf: (a: number, b: number, c: number) => [number, number, number, number];
    readonly pm_to_svg_pages: (a: number, b: number, c: number) => [number, number, number, number];
    readonly pm_to_txt: (a: number, b: number) => [number, number, number, number];
    readonly renderassets_addFont: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly renderassets_addImage: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly renderassets_aliasFont: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly renderassets_new: (a: number, b: number, c: number, d: number) => number;
    readonly schema_json: () => [number, number];
    readonly txt_to_pm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly validate_model: (a: number, b: number) => [number, number, number, number];
    readonly version: () => [number, number];
    readonly word_count: (a: number, b: number) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
