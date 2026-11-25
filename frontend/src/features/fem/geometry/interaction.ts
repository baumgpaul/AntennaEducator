/**
 * Mouse editing of the geometry, as pure functions (the canvas wires them to
 * pointer events): drawing tools → steps, snapping, handles of a selected
 * primitive, moving objects, picking edges. Coordinates the user typed as
 * expressions (parametric models) are never overwritten by the mouse: moving
 * such an object adds a Move step instead.
 */
import { evaluate, type Expr } from '../expressions';
import type { FemModel, Point2, Step, StepKind } from '../model';
import { takenNames, uniqueName } from './edit';
import type { Geo, Pt, Sequence } from './sequence';
import { STEPS } from './steps';

/** What the mouse does on the canvas */
export type Tool = 'select' | 'pick-edge' | Extract<StepKind, DrawKind>;
export type DrawKind = 'rectangle' | 'circle' | 'ellipse' | 'sector' | 'polygon' | 'polyline' | 'arc' | 'spline' | 'point';

/** How a tool is used: drag (press–release), n clicks, or clicks until finished */
export const GESTURE: Record<DrawKind, { kind: 'drag' } | { kind: 'clicks'; n: number } | { kind: 'open'; min: number }> = {
  rectangle: { kind: 'drag' },
  circle: { kind: 'drag' },
  ellipse: { kind: 'drag' },
  sector: { kind: 'clicks', n: 3 },
  arc: { kind: 'clicks', n: 3 },
  point: { kind: 'clicks', n: 1 },
  polygon: { kind: 'open', min: 3 },
  polyline: { kind: 'open', min: 2 },
  spline: { kind: 'open', min: 2 },
};

export const TOOL_HINT: Record<Tool, string> = {
  select: 'Click to select (ctrl-click: several), drag to move, drag a handle to resize; drag the background to pan',
  'pick-edge': 'Click an edge to name it (with a named boundary selected: add the edge to it)',
  rectangle: 'Drag from corner to corner',
  circle: 'Drag from the centre outwards',
  ellipse: 'Drag the box around it',
  sector: 'Click the centre, the start of the arc, then its end',
  arc: 'Click the centre, the start, then the end',
  point: 'Click where the point goes',
  polygon: 'Click the corners; double-click or Enter to finish',
  polyline: 'Click the points; double-click or Enter to finish',
  spline: 'Click the points; double-click or Enter to finish',
};

const isDraw = (t: Tool): t is DrawKind => t in GESTURE;
export { isDraw };

/** A tidy number: rounded to a fraction of the snap step (or 6 digits). */
export function tidy(v: number, step?: number): number {
  if (!step) return Number(v.toPrecision(6));
  const decimals = Math.min(20, Math.max(0, 1 - Math.floor(Math.log10(step))));
  return Number((Math.round(v / step) * step).toFixed(decimals)) + 0; // + 0: no -0
}

/** 1, 2 or 5 × 10ⁿ, at least `min` */
export function niceStep(min: number): number {
  const p = 10 ** Math.floor(Math.log10(min));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= min) ?? 10 * p;
}

export interface SnapOptions {
  /** grid step to round to, or null: no grid snap */
  grid: number | null;
  /** points to snap to, within `radius` */
  targets: Pt[];
  radius: number;
}

/** The point snapped to a nearby target (corner, centre, end), else to the grid. */
export function snap(p: Pt, o: SnapOptions): { at: Pt; target: boolean } {
  let best: Pt | null = null, bestD = o.radius;
  for (const t of o.targets) {
    const d = Math.hypot(t[0] - p[0], t[1] - p[1]);
    if (d <= bestD) [best, bestD] = [t, d];
  }
  if (best) return { at: best, target: true };
  if (o.grid) return { at: [tidy(p[0], o.grid), tidy(p[1], o.grid)], target: false };
  return { at: [tidy(p[0]), tidy(p[1])], target: false };
}

/**
 * Points worth snapping to: corners and ends of straight geometry, centres of
 * round primitives — not those of the objects being dragged (they would stick).
 */
export function snapTargets(model: FemModel, seq: Sequence, exclude: string[] = []): Pt[] {
  const out: Pt[] = [];
  const walk = (g: Geo) => {
    if (g.op === 'fill') g.loops.forEach((l) => l.length <= 24 && out.push(...l));
    else if (g.op === 'lines') g.paths.forEach((l) => (l.length <= 24 ? out.push(...l) : out.push(l[0], l[l.length - 1])));
    else if (g.op === 'dots') out.push(...g.pts);
    else if (g.op === 'group') g.items.forEach(walk);
    else {
      walk(g.a);
      walk(g.b);
    }
  };
  Object.values(seq.created).forEach((o) => !exclude.includes(o.name) && walk(o.geo));
  for (const s of model.steps) {
    if (exclude.includes(s.name)) continue;
    if ('cx' in s && 'cy' in s && !('objects' in s)) {
      try {
        out.push([evaluate(s.cx, seq.values), evaluate(s.cy, seq.values)]);
      } catch {
        /* an invalid step is reported elsewhere */
      }
    }
  }
  return out;
}

// ── Drawing ───────────────────────────────────────────────────────────────────

const angleOf = (c: Pt, p: Pt) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * The step a finished gesture draws (points: the clicked/dragged points,
 * already snapped), or null when it would be degenerate.
 */
export function drawnStep(kind: DrawKind, points: Pt[], name: string, step?: number): Step | null {
  const t = (v: number) => tidy(v, step ? step / 100 : undefined);
  const [a, b, c] = points;
  switch (kind) {
    case 'rectangle': {
      const w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      if (!(w > 0 && h > 0)) return null;
      return { kind, name, x: t(Math.min(a[0], b[0])), y: t(Math.min(a[1], b[1])), width: t(w), height: t(h) };
    }
    case 'circle':
      return dist(a, b) > 0 ? { kind, name, cx: t(a[0]), cy: t(a[1]), r: t(dist(a, b)) } : null;
    case 'ellipse': {
      const rx = Math.abs(b[0] - a[0]) / 2, ry = Math.abs(b[1] - a[1]) / 2;
      if (!(rx > 0 && ry > 0)) return null;
      return { kind, name, cx: t((a[0] + b[0]) / 2), cy: t((a[1] + b[1]) / 2), rx: t(rx), ry: t(ry) };
    }
    case 'sector':
    case 'arc': {
      const r = dist(a, b);
      if (!(r > 0) || dist(a, c) === 0) return null;
      const start = tidy(angleOf(a, b), 0.1);
      let end = tidy(angleOf(a, c), 0.1);
      while (end <= start) end += 360;
      return { kind, name, cx: t(a[0]), cy: t(a[1]), r: t(r), start, end: tidy(end, 0.1) };
    }
    case 'point':
      return { kind, name, x: t(a[0]), y: t(a[1]) };
    case 'polygon':
    case 'polyline':
    case 'spline': {
      const pts = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 0);
      if (pts.length < (kind === 'polygon' ? 3 : 2)) return null;
      return { kind, name, points: pts.map(([x, y]) => [t(x), t(y)] as Point2) };
    }
  }
}

export function newName(model: FemModel, kind: StepKind): string {
  return uniqueName(STEPS[kind].prefix, takenNames(model));
}

// ── Handles ───────────────────────────────────────────────────────────────────

export interface Handle {
  id: string;
  at: Pt;
}

const num = (e: Expr | undefined | null): e is number => typeof e === 'number';
const allNum = (...es: (Expr | undefined | null)[]) => es.every((e) => e === undefined || num(e));

/** The step that made a live object, if the mouse may edit its numbers directly
 * (a primitive with no transform applied since). */
export function directStep(model: FemModel, name: string): number | null {
  const i = model.steps.findIndex((s) => s.name === name);
  if (i < 0 || !(model.steps[i].kind in GESTURE)) return null;
  const transformed = model.steps.slice(i + 1).some((s) => 'objects' in s && s.objects.includes(name));
  return transformed ? null : i;
}

/** Resize handles of a step whose numbers are plain (no expressions). */
export function handlesOf(step: Step): Handle[] {
  const rot = (s: { rotation?: Expr }) => s.rotation === undefined || s.rotation === 0;
  switch (step.kind) {
    case 'rectangle': {
      const { x, y, width: w, height: h } = step;
      if (!allNum(x, y, w, h) || !rot(step)) return [];
      return [
        { id: 'c0', at: [x as number, y as number] },
        { id: 'c1', at: [(x as number) + (w as number), y as number] },
        { id: 'c2', at: [(x as number) + (w as number), (y as number) + (h as number)] },
        { id: 'c3', at: [x as number, (y as number) + (h as number)] },
      ];
    }
    case 'circle':
      return allNum(step.cx, step.cy, step.r) ? [{ id: 'r', at: [(step.cx as number) + (step.r as number), step.cy as number] }] : [];
    case 'ellipse':
      if (!allNum(step.cx, step.cy, step.rx, step.ry) || !rot(step)) return [];
      return [
        { id: 'rx', at: [(step.cx as number) + (step.rx as number), step.cy as number] },
        { id: 'ry', at: [step.cx as number, (step.cy as number) + (step.ry as number)] },
      ];
    case 'sector':
    case 'arc': {
      if (!allNum(step.cx, step.cy, step.r, step.start, step.end)) return [];
      const at = (deg: number): Pt => [(step.cx as number) + (step.r as number) * Math.cos((deg * Math.PI) / 180), (step.cy as number) + (step.r as number) * Math.sin((deg * Math.PI) / 180)];
      return [
        { id: 'start', at: at(step.start as number) },
        { id: 'end', at: at(step.end as number) },
      ];
    }
    case 'polygon':
    case 'polyline':
    case 'spline':
      return step.points.flatMap(([x, y], i) => (num(x) && num(y) ? [{ id: `p${i}`, at: [x, y] as Pt }] : []));
    case 'point':
      return allNum(step.x, step.y) ? [{ id: 'p', at: [step.x as number, step.y as number] }] : [];
    default:
      return [];
  }
}

/** The step with handle `id` dragged to p (snapped), or the step unchanged when that would be degenerate. */
export function dragHandle(step: Step, id: string, p: Pt): Step {
  const [px, py] = p;
  switch (step.kind) {
    case 'rectangle': {
      const k = Number(id.slice(1));
      const x0 = step.x as number, y0 = step.y as number, x1 = x0 + (step.width as number), y1 = y0 + (step.height as number);
      // the opposite corner stays
      const ox = k === 0 || k === 3 ? x1 : x0, oy = k === 0 || k === 1 ? y1 : y0;
      const w = Math.abs(px - ox), h = Math.abs(py - oy);
      if (!(w > 0 && h > 0)) return step;
      return { ...step, x: tidy(Math.min(px, ox)), y: tidy(Math.min(py, oy)), width: tidy(w), height: tidy(h) };
    }
    case 'circle': {
      const r = Math.hypot(px - (step.cx as number), py - (step.cy as number));
      return r > 0 ? { ...step, r: tidy(r) } : step;
    }
    case 'ellipse': {
      const r = id === 'rx' ? Math.abs(px - (step.cx as number)) : Math.abs(py - (step.cy as number));
      return r > 0 ? { ...step, [id]: tidy(r) } : step;
    }
    case 'sector':
    case 'arc': {
      const c: Pt = [step.cx as number, step.cy as number];
      const r = dist(c, p);
      if (!(r > 0)) return step;
      const a = tidy(angleOf(c, p), 0.1);
      const start = id === 'start' ? a : (step.start as number);
      let end = id === 'end' ? a : (step.end as number);
      while (end <= start) end += 360;
      while (end - start > 360) end -= 360;
      return { ...step, r: tidy(r), start, end: tidy(end, 0.1) };
    }
    case 'polygon':
    case 'polyline':
    case 'spline': {
      const i = Number(id.slice(1));
      return { ...step, points: step.points.map((q, j) => (j === i ? ([tidy(px), tidy(py)] as Point2) : q)) };
    }
    case 'point':
      return { ...step, x: tidy(px), y: tidy(py) };
    default:
      return step;
  }
}

// ── Moving ────────────────────────────────────────────────────────────────────

/** The primitive shifted by (dx, dy), or null if a position is an expression. */
function shifted(step: Step, dx: number, dy: number): Step | null {
  const sx = (e: Expr) => (num(e) ? tidy(e + dx) : null);
  const sy = (e: Expr) => (num(e) ? tidy(e + dy) : null);
  if ('points' in step) {
    const pts = step.points.map(([x, y]) => [sx(x), sy(y)]);
    return pts.every(([x, y]) => x !== null && y !== null) ? { ...step, points: pts as Point2[] } : null;
  }
  if ('cx' in step && !('objects' in step)) {
    const cx = sx(step.cx), cy = sy(step.cy);
    return cx !== null && cy !== null ? { ...step, cx, cy } : null;
  }
  if (step.kind === 'rectangle' || step.kind === 'point') {
    const x = sx(step.x), y = sy(step.y);
    return x !== null && y !== null ? { ...step, x, y } : null;
  }
  return null;
}

/**
 * Move live objects by (dx, dy): a primitive with plain numbers gets new
 * numbers; anything else (results of booleans, arrays, parametric positions)
 * gets a Move step — the last one is extended when it moves the same objects.
 */
export function moveObjects(model: FemModel, names: string[], dx: number, dy: number): FemModel {
  if (!names.length || (dx === 0 && dy === 0)) return model;
  const steps = [...model.steps];
  const rest: string[] = [];
  for (const n of names) {
    const i = directStep(model, n);
    const moved = i === null ? null : shifted(steps[i], dx, dy);
    if (moved) steps[i] = moved;
    else rest.push(n);
  }
  if (rest.length) {
    const last = steps.at(-1);
    const same = last?.kind === 'move' && !last.keep && num(last.dx) && num(last.dy) && last.objects.length === rest.length && rest.every((n) => last.objects.includes(n));
    if (same && last?.kind === 'move') steps[steps.length - 1] = { ...last, dx: tidy((last.dx as number) + dx), dy: tidy((last.dy as number) + dy) };
    else steps.push({ kind: 'move', name: uniqueName('mov', takenNames(model)), objects: rest, dx: tidy(dx), dy: tidy(dy) });
  }
  return { ...model, steps };
}

// ── Picking edges ─────────────────────────────────────────────────────────────

function nearestOnPolyline(l: Pt[], p: Pt, closed: boolean): { at: Pt; d: number } {
  let best = { at: l[0], d: Infinity };
  const n = closed ? l.length : l.length - 1;
  for (let i = 0; i < n; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0;
    const q: Pt = [a[0] + t * vx, a[1] + t * vy];
    const d = dist(q, p);
    if (d < best.d) best = { at: q, d };
  }
  return best;
}

/** The nearest point on any edge or curve of the model, within `tolerance`. */
export function nearestEdgePoint(seq: Sequence, p: Pt, tolerance: number): Pt | null {
  let best: { at: Pt; d: number } = { at: p, d: tolerance };
  const walk = (g: Geo) => {
    if (g.op === 'fill' || g.op === 'lines') {
      for (const l of g.op === 'fill' ? g.loops : g.paths) {
        const q = nearestOnPolyline(l, p, g.op === 'fill');
        if (q.d <= best.d) best = q;
      }
    } else if (g.op === 'group') g.items.forEach(walk);
    else if (g.op === 'cut' || g.op === 'common') {
      walk(g.a);
      walk(g.b);
    }
  };
  seq.objects.forEach((o) => walk(o.geo));
  return best.at === p ? null : best.at;
}
