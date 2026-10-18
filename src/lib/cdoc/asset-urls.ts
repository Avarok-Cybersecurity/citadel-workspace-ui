/**
 * Where the Citadel Docs binary and faces are served. Stable, unhashed URLs: the binary is
 * precached with its glue (vite.config.ts), and scripts/sync-cdoc-wasm.sh writes CDOC_WASM_URL
 * into the glue, which the vendored-pair test checks against this constant.
 */
export const CDOC_WASM_URL: string = '/cdoc/cdoc_wasm_bg.wasm';
export const CDOC_FONT_BASE_URL: string = '/fonts/cdoc/';
