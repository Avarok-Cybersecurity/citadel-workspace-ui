/**
 * The Citadel Docs status bar: where the reader is ("Page N of M", announced politely as it
 * changes) and the zoom, as a slider from 50% to 400% with step buttons either side.
 */
import { Minus, Plus } from 'lucide-react';
import type { PageStatus } from '../PageView';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, clampZoom, zoomBySteps, zoomPercent } from './zoom';

interface DocsStatusBarProps {
  readonly status: PageStatus | null;
  readonly zoom: number;
  readonly onZoomChange: (zoom: number) => void;
}

const STEP_BUTTON: string = 'inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-40';

export function DocsStatusBar({ status, zoom, onZoomChange }: DocsStatusBarProps): JSX.Element {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground" data-testid="docs-status-bar">
      <p aria-live="polite" data-testid="docs-page-status">{status === null ? 'Opening…' : `Page ${status.current} of ${status.total}`}</p>
      <div className="flex items-center gap-1">
        <button type="button" className={STEP_BUTTON} aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => onZoomChange(zoomBySteps(zoom, -1))}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          aria-valuetext={`${zoomPercent(zoom)}%`}
          data-testid="docs-zoom"
          min={zoomPercent(MIN_ZOOM)}
          max={zoomPercent(MAX_ZOOM)}
          step={zoomPercent(ZOOM_STEP)}
          value={zoomPercent(zoom)}
          onChange={(e) => onZoomChange(clampZoom(Number(e.target.value) / 100))}
          className="w-24 accent-primary sm:w-32"
        />
        <button type="button" className={STEP_BUTTON} aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => onZoomChange(zoomBySteps(zoom, 1))}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="w-10 text-right tabular-nums" aria-hidden="true">{zoomPercent(zoom)}%</span>
      </div>
    </div>
  );
}
