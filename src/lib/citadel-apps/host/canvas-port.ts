/**
 * The worker's CanvasPort: draws an app's commands on the OffscreenCanvas the page transferred
 * (the cdoc attachCanvas pattern). Commands are data, checked one by one: finite numbers, `#rrggbb`
 * colours, text drawn as text. No images, no paths from strings, nothing that reads pixels back.
 */
import { isCborMap, type CborMap } from './cbor';
import type { CanvasPort, PortAnswer } from './ports';

/** The slice of a 2D context the port draws with (an OffscreenCanvasRenderingContext2D). */
export interface CanvasSurface {
  readonly width: number;
  readonly height: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export const MAX_DRAW_COMMANDS = 4096;
const COLOUR: RegExp = /^#[0-9a-fA-F]{6}$/;
const MAX_TEXT = 1024;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bad: PortAnswer = { refused: { policy: 'bad_arguments' } };

type Paint = (surface: CanvasSurface) => void;

/** One command as a paint step, or null when it is off-shape. Every command is checked before any is drawn. */
function parse(cmd: CborMap): Paint | null {
  if (cmd.op === 'clear') return (s: CanvasSurface): void => s.clearRect(0, 0, s.width, s.height);
  const color: unknown = cmd.color;
  if (typeof color !== 'string' || !COLOUR.test(color)) return null;
  const [x, y] = [num(cmd.x), num(cmd.y)];
  if (x === null || y === null) return null;
  const [w, h] = [num(cmd.w), num(cmd.h)];
  if (cmd.op === 'fill_rect' && w !== null && h !== null) {
    return (s: CanvasSurface): void => {
      s.fillStyle = color;
      s.fillRect(x, y, w, h);
    };
  }
  const text: unknown = cmd.text;
  const requested: number | null = num(cmd.size);
  if (cmd.op === 'fill_text' && requested !== null && typeof text === 'string' && text.length <= MAX_TEXT) {
    const size: number = Math.min(Math.max(requested, 4), 256);
    return (s: CanvasSurface): void => {
      s.fillStyle = color;
      s.font = `${size}px sans-serif`;
      s.fillText(text, x, y);
    };
  }
  return null;
}

/** `surface()` is null until the page has attached a canvas. */
export function canvasPort(surface: () => CanvasSurface | null): CanvasPort {
  return {
    draw: (args: CborMap): PortAnswer => {
      const s: CanvasSurface | null = surface();
      if (s === null) return { refused: { unavailable: 'canvas' } };
      if (!Array.isArray(args.cmds) || args.cmds.length > MAX_DRAW_COMMANDS) return bad;
      const paints: (Paint | null)[] = (args.cmds as unknown[]).map((c: unknown) => (isCborMap(c) ? parse(c) : null));
      if (paints.some((p: Paint | null) => p === null)) return bad;
      for (const paint of paints) (paint as Paint)(s);
      return { ok: null };
    },
    size: (): PortAnswer => {
      const s: CanvasSurface | null = surface();
      return s === null ? { refused: { unavailable: 'canvas' } } : { ok: { w: s.width, h: s.height } };
    },
  };
}
