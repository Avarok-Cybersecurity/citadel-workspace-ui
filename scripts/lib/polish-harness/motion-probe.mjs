/**
 * Measures a whole sidebar transition frame by frame and scores how rough it is.
 *
 * Every tree row (`[data-tree-node]`) is tracked as a person sees it: a row that changes list is a new element
 * in its new place, so the on-screen row is keyed by its node id while it is live, and a leaving copy (which
 * drops its role) is tracked on its own. The boxes -- the ancestor stack, the sibling list, the whole tree and
 * what sits below it -- are tracked too. Each track records the box as drawn (transforms included) clipped by
 * every overflow-hiding ancestor, and how opaque it is.
 *
 * Rough is, numerically:
 *   reversal  -- a top or height that moves one way, then the other (each leg > 1px);
 *   jump      -- a single frame that moves a moving thing by more than JUMP_PX, out of step with its neighbours;
 *   overlap   -- two rows that are both mostly opaque whose paint (the line's fill if it has one, else its text
 *                and icons) overlaps by more than OVERLAP_PX in one frame;
 *   snap      -- something that ends > 2px from where it started with no frame in between.
 */
export const JUMP_PX = 12;
export const OVERLAP_PX = 4;
const OPAQUE = 0.5;

/** Clicks `clicked` inside the page and returns, per track, one sample per animation frame for `ms`. */
export function sampleTransition(page, clicked, ms) {
  return page.evaluate(async ({ id, span }) => {
    const tree = () => document.querySelector('[role="tree"]');
    // Drawn boxes are what a person sees move; the others are layout boxes with nothing painted, recorded only.
    const BOXES = {
      // The stack's tint and outline are their own layer; the list item around it paints nothing.
      stack: [true, () => document.querySelector('[data-testid="tree-ancestor-stack"] > [aria-hidden="true"]')],
      // The tree's visible extent is the clipping box its height animates on (AutoHeight); without motion, the tree.
      tree: [true, () => tree()?.parentElement.closest('.overflow-hidden') ?? tree()],
      below: [true, () => document.querySelector('[data-testid="below-tree"]')],
      siblings: [false, () => document.querySelector('[role="tree"] > li:last-child')],
      treeLayout: [false, tree],
    };
    // A clip-path inset() cuts the top and bottom edges; its lengths are px, % of the box, or calc() of both.
    const length = (arg, height) => {
      const terms = arg.replace(/^calc\((.*)\)$/, '$1').replace(/\s+-\s+/g, ' + -').split(/\s+\+\s+/);
      return terms.reduce((sum, t) => sum + (t.endsWith('%') ? (parseFloat(t) / 100) * height : parseFloat(t) || 0), 0);
    };
    const insetEdges = (clip, height) => {
      const m = /^inset\((.*)\)$/.exec(clip ?? '');
      if (!m) return null;
      const args = m[1].match(/calc\([^)]*\)|[^\s]+/g);
      const [top, , bottom = top] = args;
      return { top: length(top, height), bottom: length(bottom, height) };
    };
    const ghosts = new WeakMap();
    let next = 0;
    const uids = new WeakMap();
    const identity = (el) => { if (!uids.has(el)) uids.set(el, next++); return uids.get(el); };
    const drawn = (el) => {
      const r = el.getBoundingClientRect();
      let top = r.top;
      let bottom = r.bottom;
      let opacity = 1;
      for (let p = el; p; p = p.parentElement) {
        const style = getComputedStyle(p);
        opacity *= Number(style.opacity);
        const c = p.getBoundingClientRect();
        if (p !== el && style.overflowY !== 'visible') {
          top = Math.max(top, c.top);
          bottom = Math.min(bottom, c.bottom);
        }
        const inset = insetEdges(style.clipPath, c.height);
        if (inset) {
          top = Math.max(top, c.top + inset.top);
          bottom = Math.min(bottom, c.bottom - inset.bottom);
        }
      }
      // What the row paints: its whole line when it has a fill (selected, hovered), else its text and icons.
      const filled = !/rgba\(.*, 0\)$|transparent/.test(getComputedStyle(el).backgroundColor);
      const marks = filled ? [r] : [...el.querySelectorAll('svg, span')].filter((m) => m.children.length === 0 || m.tagName === 'svg').map((m) => m.getBoundingClientRect()).filter((m) => m.height > 0);
      const inkTop = Math.max(top, Math.min(...marks.map((m) => m.top)));
      const inkBottom = Math.min(bottom, Math.max(...marks.map((m) => m.bottom)));
      return { top: r.top, height: r.height, shown: Math.max(0, bottom - top), shownTop: top, opacity, inkTop, ink: Math.max(0, inkBottom - inkTop) };
    };
    const frame = () => {
      const out = {};
      for (const el of document.querySelectorAll('[role="tree"] [data-tree-node]')) {
        const live = el.getAttribute('role') === 'treeitem';
        if (!live && !ghosts.has(el)) ghosts.set(el, `ghost${next++}:${el.getAttribute('data-tree-node')}`);
        out[live ? `row:${el.getAttribute('data-tree-node')}` : ghosts.get(el)] = { ...drawn(el), row: true, scored: true, el: identity(el) };
      }
      for (const [name, [scored, find]] of Object.entries(BOXES)) {
        const el = find();
        if (el) out[`box:${name}`] = { ...drawn(el), row: false, scored, el: identity(el) };
      }
      return out;
    };
    const stamped = (t) => ({ ...frame(), t });
    // Read each frame after every rAF callback in it has run (framer's among them, in whatever order the engine
    // calls them), so a sample is what that frame painted, stamped with the frame's own time.
    const afterFrame = (read) => requestAnimationFrame((t) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => read(t);
      channel.port2.postMessage(null);
    });
    // Script-driven motion is invisible to document.getAnimations(): wait until nothing has moved for 10 frames.
    await new Promise((done) => {
      let [last, still] = ['', 0];
      const tick = () => {
        const now = JSON.stringify(frame());
        [still, last] = [now === last ? still + 1 : 0, now];
        if (still >= 10) done(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const frames = [stamped(performance.now())];
    document.querySelector(`[data-testid="${id}"]`).click();
    const start = performance.now();
    await new Promise((done) => {
      const read = (t) => {
        frames.push(stamped(t));
        if (performance.now() - start < span) afterFrame(read); else done();
      };
      afterFrame(read);
    });
    return frames;
  }, { id: clicked, span: ms });
}

/** One track's samples, in frame order, from the frame it first appears to the frame it last does. */
function tracks(frames) {
  const out = new Map();
  frames.forEach((f, i) => {
    for (const [key, v] of Object.entries(f)) {
      if (key === 't') continue;
      if (!out.has(key)) out.set(key, []);
      out.get(key).push({ ...v, frame: i, t: f.t });
    }
  });
  return out;
}

/** True when the series travels > 1px one way and then > 1px back. Sub-pixel jitter is ignored. */
function reversals(series) {
  const legs = [];
  for (let i = 1; i < series.length; i++) {
    const d = series[i] - series[i - 1];
    if (Math.abs(d) < 0.25) continue;
    const last = legs[legs.length - 1];
    if (last && Math.sign(last) === Math.sign(d)) legs[legs.length - 1] += d; else legs.push(d);
  }
  const real = legs.filter((l) => Math.abs(l) > 1);
  return real.some((l, i) => i > 0 && Math.sign(l) !== Math.sign(real[i - 1]));
}

/**
 * The runs of one property to judge as continuous. A row that changes list is a new element that cross-fades
 * in over the old one (framer's shared layout), so its HEIGHT may differ across that hand-over -- the two are
 * blended, not swapped -- and its opacity starts again from the new copy's, but its POSITION must carry
 * straight on.
 */
function runs(samples, prop) {
  if (prop === 'shownTop') return [samples];
  const out = [[]];
  samples.forEach((s, i) => {
    if (i > 0 && s.el !== samples[i - 1].el && (prop === 'opacity' || s.opacity < OPAQUE)) out.push([]);
    out[out.length - 1].push(s);
  });
  return out;
}

/**
 * A frame that moves something by more than JUMP_PX AND at more than twice either neighbouring frame's speed: a
 * discontinuity, not the fast middle of an eased glide (a 150px move in the glide's 13 frames averages 11.5px
 * a frame, so a bare threshold would fail any glide that long). Steps over JUMP_PX are also listed as `steep`.
 */
function spikes(steps, times) {
  // Judged as speed, not distance: a headless engine's frames are uneven, and a long frame covers more ground.
  const speed = steps.map((d, i) => d / Math.max(1, times[i + 1] - times[i]));
  // The last step has no successor to compare with; a track that ends by vanishing is judged as an appearance.
  return steps.filter((d, i) => i < steps.length - 1 && d > JUMP_PX && speed[i] > 2 * Math.max(speed[i - 1] ?? 0, speed[i + 1]));
}

/**
 * Something that comes or goes at strength: a track that starts or ends with a visible frame more than half
 * opaque, unless the same node is on screen in the neighbouring frame (a row handed from its live element
 * to its leaving copy, or the reverse, is one row). Fading out and then snapping back for a frame is caught
 * as a reversal of opacity.
 */
function appearances(frames, found) {
  const node = (key) => key.slice(key.indexOf(':') + 1);
  // And what has not finished when sampling ends: a leaving copy still drawn, or a live row not yet opaque.
  for (const [key, v] of Object.entries(frames[frames.length - 1])) {
    if (key === 't' || !v.row || v.shown <= 1) continue;
    if (key.startsWith('ghost') && v.opacity > 0.05) found.snap.push(`${key} never left (opacity ${v.opacity.toFixed(2)})`);
    if (key.startsWith('row') && v.opacity < 0.95) found.snap.push(`${key} never arrived (opacity ${v.opacity.toFixed(2)})`);
  }
  const shown = (v) => v && v.shown > 1 && v.opacity > OPAQUE;
  const nodesIn = (f) => new Set(Object.keys(f).filter((k) => k !== 't' && f[k].row).map(node));
  for (let i = 1; i < frames.length - 1; i++) {
    const [before, now, after] = [frames[i - 1], frames[i], frames[i + 1]];
    for (const [key, v] of Object.entries(now)) {
      if (key === 't' || !v.scored || !v.row) continue;
      if (!(key in before) && shown(v) && !nodesIn(before).has(node(key))) found.snap.push(`${key} appeared at opacity ${v.opacity.toFixed(2)} (frame ${i})`);
      if (!(key in after) && shown(v) && !nodesIn(after).has(node(key))) found.snap.push(`${key} vanished at opacity ${v.opacity.toFixed(2)} (frame ${i})`);
    }
  }
}

/** What is rough about `frames`, as lists of human-readable findings per criterion. */
export function roughness(frames) {
  const found = { reversal: [], jump: [], overlap: [], snap: [], steep: [] };
  for (const [key, samples] of tracks(frames)) {
    if (!samples[0].scored) continue;
    const visible = samples.filter((s) => s.shown > 1 && s.opacity > 0.05);
    for (const run of runs(visible, 'opacity')) {
      const fade = run.map((s) => s.opacity);
      if (reversals(fade.map((o) => o * 100))) found.reversal.push(`${key}.opacity ${fade.map((o) => o.toFixed(2)).join(',')}`);
    }
    for (const prop of ['shownTop', 'shown']) {
      for (const run of runs(visible, prop)) {
        const series = run.map((s) => s[prop]);
        if (series.length < 2) continue;
        const label = `${key}.${prop}`;
        if (reversals(series)) found.reversal.push(`${label} ${series.map((v) => v.toFixed(0)).join(',')}`);
        const steps = series.slice(1).map((v, i) => Math.abs(v - series[i]));
        // A row's clipped height changes as fast as the edge sweeping it moves: that edge's box is judged, not the row.
        const swept = prop === 'shown' && run[0].row;
        const spiked = swept ? [] : spikes(steps, run.map((r) => r.t));
        if (spiked.length > 0) found.jump.push(`${label} ${Math.max(...spiked).toFixed(1)}px in one frame: ${series.map((v) => v.toFixed(0)).join(',')}`);
        if (Math.max(...steps) > JUMP_PX) found.steep.push(`${label} ${Math.max(...steps).toFixed(1)}px`);
        const first = series[0];
        const last = series[series.length - 1];
        const between = series.filter((v) => v > Math.min(first, last) + 0.5 && v < Math.max(first, last) - 0.5).length;
        // Two frames have nothing between them to judge: a copy seen for two frames as it fades is not a snap.
        if (!swept && series.length > 2 && Math.abs(last - first) > 2 && between === 0) found.snap.push(`${label} ${first.toFixed(0)} -> ${last.toFixed(0)}`);
      }
    }
  }
  appearances(frames, found);
  frames.forEach((f, i) => {
    const rows = Object.entries(f).filter(([key, v]) => key !== 't' && v.row && v.shown > 1 && v.opacity > OPAQUE);
    const node = (key) => key.slice(key.indexOf(':') + 1);
    for (let a = 0; a < rows.length; a++) {
      for (let b = a + 1; b < rows.length; b++) {
        const [ka, va] = rows[a];
        const [kb, vb] = rows[b];
        // A row's own cross-fade: the copy it is leaving behind and the one taking its place.
        if (node(ka) === node(kb)) continue;
        const overlap = Math.min(va.inkTop + va.ink, vb.inkTop + vb.ink) - Math.max(va.inkTop, vb.inkTop);
        if (overlap > OVERLAP_PX) found.overlap.push(`frame ${i}: ${ka} and ${kb} by ${overlap.toFixed(1)}px`);
      }
    }
  });
  return found;
}

export const ROUGH = ['reversal', 'jump', 'overlap', 'snap'];
