/**
 * The worker's canvas port over a recording surface: commands are drawn only when every one of
 * them is well-formed, and nothing is drawn before a canvas is attached.
 */
import { describe, expect, it } from 'vitest';
import { canvasPort, MAX_DRAW_COMMANDS, type CanvasSurface } from '../canvas-port';

function surface(): CanvasSurface & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls, width: 300, height: 150, fillStyle: '#000000', font: '',
    clearRect: (): void => { calls.push('clear'); },
    fillRect: (x: number, y: number, w: number, h: number): void => { calls.push(`rect ${x} ${y} ${w} ${h}`); },
    fillText: (t: string): void => { calls.push(`text ${t}`); },
  };
}

describe('canvasPort', () => {
  it('draws well-formed commands and reports its size', () => {
    const s = surface();
    const port = canvasPort(() => s);
    expect(port.draw({ cmds: [{ op: 'clear' }, { op: 'fill_rect', x: 1, y: 2, w: 3, h: 4, color: '#ff0000' }, { op: 'fill_text', x: 0, y: 9, size: 12, text: '<b>hi</b>', color: '#00ff00' }] }))
      .toEqual({ ok: null });
    expect(s.calls).toEqual(['clear', 'rect 1 2 3 4', 'text <b>hi</b>']);
    expect(port.size({})).toEqual({ ok: { w: 300, h: 150 } });
  });

  it('draws nothing when any command is off-shape', () => {
    for (const bad of [
      { op: 'fill_rect', x: 1, y: 2, w: 3, h: Number.NaN, color: '#ff0000' },
      { op: 'fill_rect', x: 1, y: 2, w: 3, h: 4, color: 'red; background: url(x)' },
      { op: 'draw_image', url: 'https://evil.example/x.png' },
      'clear',
    ]) {
      const s = surface();
      expect(canvasPort(() => s).draw({ cmds: [{ op: 'clear' }, bad] })).toEqual({ refused: { policy: 'bad_arguments' } });
      expect(s.calls).toEqual([]);
    }
    const s = surface();
    expect(canvasPort(() => s).draw({ cmds: Array.from({ length: MAX_DRAW_COMMANDS + 1 }, () => ({ op: 'clear' })) })).toEqual({ refused: { policy: 'bad_arguments' } });
  });

  it('is unavailable until a canvas is attached', () => {
    expect(canvasPort(() => null).draw({ cmds: [] })).toEqual({ refused: { unavailable: 'canvas' } });
  });
});
