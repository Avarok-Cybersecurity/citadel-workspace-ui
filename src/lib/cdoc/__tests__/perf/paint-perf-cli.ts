/** Run by scripts/check-cdoc-paint-perf.mjs through vite-node; prints the measurement. */
import { measurePaint, type PaintPerf } from './paint-perf';

const [runs, zoom, dpr]: number[] = process.argv.slice(2).map(Number);
const r: PaintPerf = await measurePaint(runs, zoom, dpr);
console.log(`${r.pages} pages, ${r.bytes} bytes, zoom ${zoom}, dpr ${dpr}`);
console.log(`decode (open + every page body), median of ${runs}: ${r.decodeMs.toFixed(2)} ms`);
console.log(`glyph outlines for every page (wasm glyph_path + Path2D): ${r.outlineMs.toFixed(2)} ms`);
console.log(`first page paint, cold atlas: ${r.firstPaintMs.toFixed(2)} ms`);
console.log(`every page after the first: ${r.allPagesPaintMs.toFixed(2)} ms`);
console.log(`atlas ${JSON.stringify(r.atlas)}, hit rate ${(100 * r.hitRate).toFixed(2)}%`);
