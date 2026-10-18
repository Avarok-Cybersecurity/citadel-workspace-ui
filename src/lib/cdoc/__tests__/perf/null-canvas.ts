/**
 * A no-op canvas platform for the perf measurements: node has no canvas, so "paint" measures
 * the painter's own work (decode, placement, rounding, atlas bookkeeping, the calls it
 * issues), not the browser's rasterisation.
 */
import type { CanvasPort, Ctx2D, PaintTarget } from '../../paint/canvas-port';

const noop = (): void => undefined;
const nullCtx: Ctx2D = new Proxy({}, { get: () => noop, set: () => true }) as unknown as Ctx2D;

export const nullPort: CanvasPort = {
  createSurface: () => ({ ctx: nullCtx, image: {} as CanvasImageSource }),
  createPath: () => new Proxy({}, { get: () => noop }) as unknown as Path2D,
};

export const nullTarget: PaintTarget = { ctx: nullCtx, resize: noop };
