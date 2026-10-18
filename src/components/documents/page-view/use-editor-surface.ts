/**
 * What an editable page view adds to a static one: the hidden textarea that takes the keyboard
 * (IME bridge), pointer selection over the pages, per-page repaint revisions bumped by the
 * editor's `pages` events (only dirty pages repaint), the page sizes as they change, and the
 * overlay scene (local selection, caret, peers) for each page.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorSession } from '@/lib/cdoc/editor/editor-session';
import type { EditorEvents, EditorState } from '@/lib/cdoc/editor/controller';
import type { PeerPresence } from '@/lib/cdoc/editor/peer-overlay';
import { attachImeBridge } from '@/lib/cdoc/editor/input/ime-bridge';
import { attachPointer, type PagePoint } from '@/lib/cdoc/editor/input/pointer';
import type { Platform } from '@/lib/cdoc/editor/input/keymap';
import type { OverlayScene } from '@/lib/cdoc/paint/overlay-painter';
import type { DeviceScale } from '@/lib/cdoc/paint/units';
import type { OverlayContextOf } from './PageOverlays';

export interface EditorSurfaceOptions {
  readonly platform: Platform;
  readonly overlayContext: OverlayContextOf;
  readonly undoPauseMs: number;
  readonly onError: (error: unknown) => void;
}

export interface EditorSurface {
  readonly overlayContext: OverlayContextOf;
  readonly textarea: RefObject<HTMLTextAreaElement>;
  readonly pageSizes: Int32Array;
  readonly revisionOf: (page: number) => number;
  readonly sceneOf: (page: number, scale: DeviceScale) => OverlayScene;
  readonly state: EditorState;
}

/** The page under a client point, in Pt100 page space, from the page element's box. */
function locator(scale: () => DeviceScale): (target: EventTarget | null, clientX: number, clientY: number) => PagePoint | null {
  return (target: EventTarget | null, clientX: number, clientY: number): PagePoint | null => {
    const el: Element | null = target instanceof Element ? target.closest('[data-page]') : null;
    if (el === null) return null;
    const page: number = Number((el as HTMLElement).dataset.page);
    const box: DOMRect = el.getBoundingClientRect();
    const css: number = scale().css;
    return { page, x: Math.round((clientX - box.left) / css), y: Math.round((clientY - box.top) / css) };
  };
}

export function useEditorSurface(editor: EditorSession, scroller: RefObject<HTMLDivElement>, scale: DeviceScale, options: EditorSurfaceOptions): EditorSurface {
  const textarea: RefObject<HTMLTextAreaElement> = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<EditorState>(editor.state);
  const [pageSizes, setPageSizes] = useState<Int32Array>(editor.pageSizes);
  const [revisions, setRevisions] = useState<ReadonlyMap<number, number>>(new Map<number, number>());
  const [peers, setPeers] = useState<readonly PeerPresence[]>(editor.peers.current);
  const scaleRef: { current: DeviceScale } = useRef<DeviceScale>(scale);
  scaleRef.current = scale;
  const { platform, undoPauseMs, onError } = options;

  useEffect((): (() => void) => {
    const offPages: () => void = editor.on('pages', (e: EditorEvents['pages']): void => {
      setPageSizes(editor.pageSizes);
      setRevisions((prev: ReadonlyMap<number, number>): ReadonlyMap<number, number> => {
        const next: Map<number, number> = new Map<number, number>(prev);
        for (const page of e.dirtyPages) next.set(page, (next.get(page) ?? 0) + 1);
        return next;
      });
    });
    const offSelection: () => void = editor.on('selection', setState);
    const offPeers: () => void = editor.peers.subscribe((): void => setPeers(editor.peers.current));
    return (): void => {
      offPages();
      offSelection();
      offPeers();
    };
  }, [editor]);

  useEffect((): (() => void) | undefined => {
    const sink: HTMLTextAreaElement | null = textarea.current;
    const surface: HTMLDivElement | null = scroller.current;
    if (sink === null || surface === null) return undefined;
    const focus = (): void => sink.focus({ preventScroll: true });
    editor.attachFocus(focus);
    const detachIme: () => void = attachImeBridge(sink, editor, { platform, pauseMs: undoPauseMs, onError });
    const detachPointer: () => void = attachPointer(surface, editor, { locate: locator(() => scaleRef.current), onError, focus });
    return (): void => {
      detachIme();
      detachPointer();
      editor.attachFocus(null);
    };
  }, [editor, scroller, platform, undoPauseMs, onError]);

  const collapsed: boolean = state.selectionRects.length === 0;
  return {
    overlayContext: options.overlayContext,
    textarea,
    pageSizes,
    state,
    revisionOf: (page: number): number => revisions.get(page) ?? 0,
    sceneOf: (page: number, s: DeviceScale): OverlayScene => ({
      page, scale: s, selection: state.selectionRects, caret: collapsed ? state.caret : null, peers,
    }),
  };
}
