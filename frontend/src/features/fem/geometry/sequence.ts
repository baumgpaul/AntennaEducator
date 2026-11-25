/**
 * The geometry sequence in the browser: checked like the mesher checks it
 * (mesher/src/fem_mesher/geometry.py), and evaluated to drawable geometry so
 * the canvas follows every edit at once. Curved edges are sampled finely;
 * booleans are kept symbolic (the canvas draws them with SVG masks, hit tests
 * evaluate them per point). The mesher computes the exact geometry.
 */
import { evaluate, evaluateParameters, ExpressionError, type Expr } from '../expressions';
import type { FemModel, Point2, Step } from '../model';
import { consumes, creates, inputsOf } from './steps';

export type Pt = [number, number];

/** Drawable geometry of an object */
export type Geo =
  | { op: 'fill'; loops: Pt[][] } // a surface: closed loops, even-odd (outer + holes)
  | { op: 'lines'; paths: Pt[][] } // curves
  | { op: 'dots'; pts: Pt[] } // points
  | { op: 'group'; items: Geo[] } // union, arrays
  | { op: 'cut'; a: Geo; b: Geo } // a without the surface of b
  | { op: 'common'; a: Geo; b: Geo }; // a inside the surface of b

export type Dim = 0 | 1 | 2;

export interface SeqObject {
  name: string;
  dim: Dim;
  geo: Geo;
}

export type Role = 'domain' | 'hole' | 'curve' | 'point' | 'input' | 'transform';

export interface TreeNode {
  step: Step;
  index: number;
  role: Role;
  error?: string;
  children: TreeNode[];
}

export interface Bounds {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface Sequence {
  /** Objects alive at the end, in painter's order (later ones win) */
  objects: SeqObject[];
  /** Every object as its step left it (also consumed ones: highlighted when chosen in the tree) */
  created: Record<string, SeqObject>;
  /** Objects alive just before each step (what its inputs may be): step index → name → dim */
  aliveBefore: Record<string, Dim>[];
  /** Step name → what is wrong with it */
  stepErrors: Record<string, string>;
  /** Everything wrong with the geometry, in order (steps, holes, selections) */
  errors: string[];
  /** What is wrong with the mesh controls (the Mesh step) */
  meshErrors: string[];
  tree: TreeNode[];
  bounds: Bounds;
  domains: string[];
  /** Possible boundary/target names known before meshing: objects, selections, outer */
  values: Record<string, number>;
}

const ARC_SAMPLES = 128; // per full turn
const RESERVED = 'outer';

class StepError extends Error {}

const rad = (deg: number) => (deg * Math.PI) / 180;

function arcPoints(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, rot = 0): Pt[] {
  const n = Math.max(2, Math.ceil((ARC_SAMPLES * Math.abs(a1 - a0)) / (2 * Math.PI)));
  const c = Math.cos(rot), s = Math.sin(rot);
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / n;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    return [cx + c * x - s * y, cy + s * x + c * y] as Pt;
  });
}

/** Catmull-Rom curve through the points (the mesher uses an interpolating B-spline: close). */
function splinePoints(p: Pt[]): Pt[] {
  if (p.length < 3) return p;
  const out: Pt[] = [p[0]];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    for (let k = 1; k <= 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

export function mapGeo(g: Geo, f: (p: Pt) => Pt): Geo {
  switch (g.op) {
    case 'fill':
      return { op: 'fill', loops: g.loops.map((l) => l.map(f)) };
    case 'lines':
      return { op: 'lines', paths: g.paths.map((l) => l.map(f)) };
    case 'dots':
      return { op: 'dots', pts: g.pts.map(f) };
    case 'group':
      return { op: 'group', items: g.items.map((i) => mapGeo(i, f)) };
    default:
      return { op: g.op, a: mapGeo(g.a, f), b: mapGeo(g.b, f) };
  }
}

const rotation = (cx: number, cy: number, deg: number) => {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  return ([x, y]: Pt): Pt => [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)];
};

/** All vertices (bounds; a cut/common only by its first operand). */
function vertices(g: Geo, out: Pt[] = []): Pt[] {
  if (g.op === 'fill') g.loops.forEach((l) => out.push(...l));
  else if (g.op === 'lines') g.paths.forEach((l) => out.push(...l));
  else if (g.op === 'dots') out.push(...g.pts);
  else if (g.op === 'group') g.items.forEach((i) => vertices(i, out));
  else vertices(g.a, out);
  return out;
}

export function boundsOf(geos: Geo[]): Bounds {
  const b = { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity };
  for (const g of geos) {
    for (const [x, y] of vertices(g)) {
      b.xmin = Math.min(b.xmin, x);
      b.ymin = Math.min(b.ymin, y);
      b.xmax = Math.max(b.xmax, x);
      b.ymax = Math.max(b.ymax, y);
    }
  }
  return Number.isFinite(b.xmin) ? b : { xmin: -0.01, ymin: -0.01, xmax: 0.01, ymax: 0.01 };
}

/** Chain curves into one closed loop (any order, either direction), or throw. */
function closedLoop(paths: Pt[][], name: string): Pt[] {
  const span = Math.max(1e-30, ...paths.flat().map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
  const tol = 1e-9 * span;
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  const rest = paths.slice(1);
  const loop = [...paths[0]];
  while (rest.length) {
    const end = loop[loop.length - 1];
    const i = rest.findIndex((p) => same(p[0], end) || same(p[p.length - 1], end));
    if (i < 0) break;
    const p = rest.splice(i, 1)[0];
    loop.push(...(same(p[0], end) ? p : [...p].reverse()).slice(1));
  }
  if (rest.length || !same(loop[0], loop[loop.length - 1])) {
    throw new StepError(`Step "${name}": the curves do not form one closed loop`);
  }
  return loop;
}

function linesOf(g: Geo): Pt[][] {
  if (g.op === 'lines') return g.paths;
  if (g.op === 'group') return g.items.flatMap(linesOf);
  throw new StepError('only plain curves can bound a surface');
}

/** The geometry a primitive step creates (numbers must be valid). */
function primitive(step: Step, ev: (e: Expr) => number): Geo | null {
  const positive = (what: string, v: number) => {
    if (!(v > 0)) throw new StepError(`Step "${step.name}": ${what} must be positive`);
    return v;
  };
  const sweep = (start: Expr, end: Expr): [number, number] => {
    const a0 = ev(start), a1 = ev(end);
    if (!(a1 - a0 > 0 && a1 - a0 <= 360 + 1e-9)) {
      throw new StepError(`Step "${step.name}": end must be after start, by at most 360°`);
    }
    return [rad(a0), rad(Math.min(a1, a0 + 360))];
  };
  const pts = (p: Point2[]) => p.map(([x, y]) => [ev(x), ev(y)] as Pt);
  switch (step.kind) {
    case 'rectangle': {
      const x = ev(step.x), y = ev(step.y);
      const w = positive('width', ev(step.width)), h = positive('height', ev(step.height));
      const r = ev(step.corner_radius ?? 0);
      if (!(r >= 0 && r < Math.min(w, h) / 2)) {
        throw new StepError(`Step "${step.name}": corner radius must be below half the shorter side`);
      }
      let loop: Pt[];
      if (r === 0) loop = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      else {
        const q = Math.PI / 2;
        loop = [
          ...arcPoints(x + w - r, y + r, r, r, -q, 0),
          ...arcPoints(x + w - r, y + h - r, r, r, 0, q),
          ...arcPoints(x + r, y + h - r, r, r, q, 2 * q),
          ...arcPoints(x + r, y + r, r, r, 2 * q, 3 * q),
        ];
      }
      const rot = ev(step.rotation ?? 0);
      return { op: 'fill', loops: [rot ? loop.map(rotation(x, y, rot)) : loop] };
    }
    case 'circle': {
      const r = positive('r', ev(step.r));
      return { op: 'fill', loops: [arcPoints(ev(step.cx), ev(step.cy), r, r, 0, 2 * Math.PI).slice(0, -1)] };
    }
    case 'ellipse': {
      const rx = positive('rx', ev(step.rx)), ry = positive('ry', ev(step.ry));
      const loop = arcPoints(ev(step.cx), ev(step.cy), rx, ry, 0, 2 * Math.PI, rad(ev(step.rotation ?? 0)));
      return { op: 'fill', loops: [loop.slice(0, -1)] };
    }
    case 'sector': {
      const cx = ev(step.cx), cy = ev(step.cy), r = positive('r', ev(step.r)), ri = ev(step.r_inner ?? 0);
      if (!(ri >= 0 && ri < r)) throw new StepError(`Step "${step.name}": inner radius must be between 0 and r`);
      const [a0, a1] = sweep(step.start, step.end);
      const outer = arcPoints(cx, cy, r, r, a0, a1);
      if (a1 - a0 >= 2 * Math.PI - 1e-12) {
        const loops = [outer.slice(0, -1)];
        if (ri > 0) loops.push(arcPoints(cx, cy, ri, ri, a0, a1).slice(0, -1));
        return { op: 'fill', loops };
      }
      const inner = ri > 0 ? arcPoints(cx, cy, ri, ri, a0, a1).reverse() : [[cx, cy] as Pt];
      return { op: 'fill', loops: [[...outer, ...inner]] };
    }
    case 'polygon':
      if (step.points.length < 3) throw new StepError(`Step "${step.name}": a polygon needs 3 corners`);
      return { op: 'fill', loops: [pts(step.points)] };
    case 'polyline': {
      if (step.points.length < 2) throw new StepError(`Step "${step.name}": a line needs 2 points`);
      const p = pts(step.points);
      return { op: 'lines', paths: [step.closed ? [...p, p[0]] : p] };
    }
    case 'arc': {
      const r = positive('r', ev(step.r));
      const [a0, a1] = sweep(step.start, step.end);
      return { op: 'lines', paths: [arcPoints(ev(step.cx), ev(step.cy), r, r, a0, a1)] };
    }
    case 'spline':
      if (step.points.length < 2) throw new StepError(`Step "${step.name}": a spline needs 2 points`);
      return { op: 'lines', paths: [splinePoints(pts(step.points))] };
    case 'point':
      return { op: 'dots', pts: [[ev(step.x), ev(step.y)]] };
    default:
      return null;
  }
}

/** The geometry of one primitive step (a drawing preview), or null. */
export function stepGeo(step: Step, values: Record<string, number>): Geo | null {
  try {
    return primitive(step, (e) => evaluate(e, values));
  } catch {
    return null;
  }
}

const PRIMITIVE_DIM: Partial<Record<Step['kind'], Dim>> = {
  rectangle: 2, circle: 2, ellipse: 2, sector: 2, polygon: 2, polyline: 1, arc: 1, spline: 1, point: 0,
};

export function checkName(name: string, what: string): string | null {
  if (!name) return `${what} needs a name`;
  if (name.includes('|') || name === RESERVED) return `Invalid ${what.toLowerCase()} name "${name}" ('|' and "outer" are reserved)`;
  return null;
}

/** Run the sequence: check it, evaluate it, build the tree. Never throws. */
export function runSequence(model: FemModel): Sequence {
  const errors: string[] = [];
  const stepErrors: Record<string, string> = {};
  let values: Record<string, number> = {};
  try {
    values = evaluateParameters(model.parameters);
  } catch (e) {
    errors.push(`Parameters: ${(e as Error).message}`);
  }
  const ev = (e: Expr) => {
    const v = evaluate(e, values);
    if (!Number.isFinite(v)) throw new ExpressionError(`"${e}" is not a finite number`);
    return v;
  };

  const live = new Map<string, SeqObject>(); // insertion order = painter's order
  const created: Record<string, SeqObject> = {};
  const aliveBefore: Record<string, Dim>[] = [];
  const seen = new Set<string>();
  // tree: the node holding each live object, and transforms waiting for their object's consumer
  const holder = new Map<string, TreeNode>();
  const pendingTransforms = new Map<string, TreeNode[]>();
  const top: TreeNode[] = [];

  model.steps.forEach((step, index) => {
    aliveBefore.push(Object.fromEntries([...live].map(([n, o]) => [n, o.dim])));
    const node: TreeNode = { step, index, role: 'input', children: [] };
    const fail = (message: string) => {
      const text = message.startsWith('Step "') ? message : `Step "${step.name}" (${step.kind}): ${message}`;
      stepErrors[step.name] = text;
      errors.push(text);
      node.error = text;
    };
    const nameError = checkName(step.name, 'Step') ?? (seen.has(step.name) ? `Step names must be unique: "${step.name}"` : null);
    seen.add(step.name);

    try {
      if (nameError) throw new StepError(nameError);
      const inputs = inputsOf(step);
      for (const n of inputs) {
        if (!live.has(n)) throw new StepError(`"${n}" is not an object at this step`);
      }
      if (new Set(inputs).size !== inputs.length) throw new StepError('an object is listed twice');
      const dimOf = (names: string[]) => names.map((n) => live.get(n)!.dim);
      const geoOf = (names: string[]): Geo =>
        names.length === 1 ? live.get(names[0])!.geo : { op: 'group', items: names.map((n) => live.get(n)!.geo) };

      let result: SeqObject | null = null;
      const prim = primitive(step, ev);
      if (prim) result = { name: step.name, dim: PRIMITIVE_DIM[step.kind]!, geo: prim };
      else if (step.kind === 'surface') {
        if (step.curves.length === 0) throw new StepError('choose the curves that bound it');
        if (dimOf(step.curves).some((d) => d !== 1)) throw new StepError('only curves can bound a surface');
        const loop = closedLoop(step.curves.flatMap((n) => linesOf(live.get(n)!.geo)), step.name);
        result = { name: step.name, dim: 2, geo: { op: 'fill', loops: [loop] } };
      } else if (step.kind === 'union' || step.kind === 'intersection' || step.kind === 'difference') {
        const min = step.kind === 'difference' ? 1 : 2;
        if (step.objects.length < min) throw new StepError(min === 1 ? 'choose an object' : 'choose at least 2 objects');
        const dims = dimOf(step.objects);
        if (new Set(dims).size !== 1 || dims[0] === 0) throw new StepError('objects must all be surfaces or all curves');
        let geo: Geo;
        if (step.kind === 'union') geo = geoOf(step.objects);
        else if (step.kind === 'intersection') {
          geo = step.objects.slice(1).reduce<Geo>((a, n) => ({ op: 'common', a, b: live.get(n)!.geo }), live.get(step.objects[0])!.geo);
        } else {
          if (step.tools.length === 0) throw new StepError('choose what to subtract');
          if (dimOf(step.tools).some((d) => d < dims[0])) throw new StepError('a tool must not have a lower dimension');
          geo = { op: 'cut', a: geoOf(step.objects), b: geoOf(step.tools) };
        }
        result = { name: step.name, dim: dims[0], geo };
      } else if (step.kind === 'array' || step.kind === 'polar_array') {
        if (step.objects.length === 0) throw new StepError('choose the objects');
        const dims = dimOf(step.objects);
        if (new Set(dims).size !== 1) throw new StepError('objects must have the same dimension');
        if (!(Number.isInteger(step.count) && step.count >= 1 && step.count <= 200)) throw new StepError('count must be 1 … 200');
        const base = geoOf(step.objects);
        const items = Array.from({ length: step.count }, (_, k) => {
          if (step.kind === 'array') {
            const dx = k * ev(step.dx), dy = k * ev(step.dy);
            return mapGeo(base, ([x, y]) => [x + dx, y + dy]);
          }
          return mapGeo(base, rotation(ev(step.cx), ev(step.cy), k * ev(step.angle)));
        });
        result = { name: step.name, dim: dims[0], geo: { op: 'group', items } };
      } else {
        // transforms (every other kind is handled above)
        const t = step as Extract<Step, { kind: 'move' | 'rotate' | 'scale' | 'mirror' }>;
        if (t.objects.length === 0) throw new StepError('choose the objects');
        let f: (p: Pt) => Pt;
        if (t.kind === 'move') {
          const dx = ev(t.dx), dy = ev(t.dy);
          f = ([x, y]) => [x + dx, y + dy];
        } else if (t.kind === 'rotate') f = rotation(ev(t.cx), ev(t.cy), ev(t.angle));
        else if (t.kind === 'scale') {
          const cx = ev(t.cx), cy = ev(t.cy), fx = ev(t.factor);
          const fy = t.factor_y === undefined || t.factor_y === null || t.factor_y === '' ? fx : ev(t.factor_y);
          if (fx === 0 || fy === 0) throw new StepError('a scale factor cannot be 0');
          f = ([x, y]) => [cx + fx * (x - cx), cy + fy * (y - cy)];
        } else {
          const a = rad(ev(t.angle)), px = ev(t.x), py = ev(t.y);
          const nx = -Math.sin(a), ny = Math.cos(a);
          f = ([x, y]) => {
            const d = 2 * (nx * (x - px) + ny * (y - py));
            return [x - d * nx, y - d * ny];
          };
        }
        if (t.keep) {
          const dims = dimOf(t.objects);
          if (new Set(dims).size !== 1) throw new StepError('copied objects must have the same dimension');
          result = { name: t.name, dim: dims[0], geo: mapGeo(geoOf(t.objects), f) };
        } else {
          for (const n of t.objects) {
            const o = live.get(n)!;
            live.set(n, { ...o, geo: mapGeo(o.geo, f) });
            created[n] = live.get(n)!;
          }
        }
      }

      // the tree: consumed inputs (with the transforms applied to them) become children
      if (consumes(step)) {
        for (const n of inputs) {
          const child = holder.get(n);
          if (child) {
            node.children.push(child);
            top.splice(top.indexOf(child), 1);
          }
          for (const t of pendingTransforms.get(n) ?? []) {
            if (!node.children.includes(t) && top.includes(t)) {
              node.children.push(t);
              top.splice(top.indexOf(t), 1);
            }
          }
          live.delete(n);
          holder.delete(n);
        }
      }
      if (!creates(step)) {
        node.role = 'transform';
        for (const n of inputs) pendingTransforms.set(n, [...(pendingTransforms.get(n) ?? []), node]);
      }
      if (result) {
        live.set(result.name, result);
        created[result.name] = result;
        holder.set(result.name, node);
      }
    } catch (e) {
      if (!(e instanceof StepError || e instanceof ExpressionError)) throw e;
      fail(e.message);
    }
    top.push(node);
  });

  // roles of what is left
  const holes = new Set(model.holes);
  for (const [name, o] of live) {
    const node = holder.get(name);
    if (node) node.role = o.dim === 2 ? (holes.has(name) ? 'hole' : 'domain') : o.dim === 1 ? 'curve' : 'point';
  }
  const domains = [...live.values()].filter((o) => o.dim === 2 && !holes.has(o.name)).map((o) => o.name);

  for (const h of model.holes) {
    if (live.get(h)?.dim !== 2) errors.push(`Hole "${h}" is not a surface object`);
  }
  if (model.steps.length > 0 && domains.length === 0 && Object.keys(stepErrors).length === 0) {
    errors.push('At least one surface must be a domain (not a hole)');
  }

  const selectionNames = model.selections.map((s) => s.name);
  model.selections.forEach((sel) => {
    const bad = checkName(sel.name, 'Selection');
    if (bad) errors.push(bad);
    else if (selectionNames.indexOf(sel.name) !== selectionNames.lastIndexOf(sel.name) || seen.has(sel.name)) {
      errors.push(`Selection names must be unique and differ from step names: "${sel.name}"`);
    }
    if (sel.kind === 'boundary_of') {
      sel.domains.filter((d) => !domains.includes(d)).forEach((d) => errors.push(`Selection "${sel.name}": "${d}" is not a domain`));
    }
  });

  const possible = new Set([...live.keys(), ...selectionNames, RESERVED]);
  const targets = new Set<string>();
  const meshErrors: string[] = [];
  for (const c of model.mesh.controls) {
    const [a, b] = c.target.split('|');
    if (!possible.has(c.target) && !(b !== undefined && domains.includes(a) && domains.includes(b))) {
      meshErrors.push(`Mesh control "${c.target}": not a domain, boundary, curve or point of the model`);
    }
    if (isUnset(c.size) && isUnset(c.divisions) && !c.structured) meshErrors.push(`Mesh control "${c.target}": set a size, divisions or structured`);
    if (c.structured && !domains.includes(c.target)) meshErrors.push(`Mesh control "${c.target}": only a domain can be structured`);
    if (targets.has(c.target)) meshErrors.push(`One mesh control per target: "${c.target}"`);
    targets.add(c.target);
  }

  const objects = [...live.values()];
  return {
    objects,
    created,
    aliveBefore,
    stepErrors,
    errors,
    meshErrors,
    tree: top,
    bounds: boundsOf(objects.map((o) => o.geo)),
    domains,
    values,
  };
}

export const isUnset = (v: Expr | null | undefined) => v === undefined || v === null || v === '';

// ── Hit testing ───────────────────────────────────────────────────────────────

function inLoops(loops: Pt[][], [x, y]: Pt): boolean {
  let inside = false;
  for (const l of loops) {
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const [xi, yi] = l[i], [xj, yj] = l[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function segmentDistance([x, y]: Pt, [x1, y1]: Pt, [x2, y2]: Pt): number {
  const dx = x2 - x1, dy = y2 - y1;
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}

/** Is the point on the surface of g (curves and points have none)? */
export function insideGeo(g: Geo, p: Pt): boolean {
  switch (g.op) {
    case 'fill':
      return inLoops(g.loops, p);
    case 'group':
      return g.items.some((i) => insideGeo(i, p));
    case 'cut':
      return insideGeo(g.a, p) && !insideGeo(g.b, p);
    case 'common':
      return insideGeo(g.a, p) && insideGeo(g.b, p);
    default:
      return false;
  }
}

/** Distance from the point to the curves/points of g (Infinity for surfaces). */
export function distanceToGeo(g: Geo, p: Pt): number {
  switch (g.op) {
    case 'lines':
      return Math.min(...g.paths.flatMap((l) => l.slice(1).map((q, i) => segmentDistance(p, l[i], q))));
    case 'dots':
      return Math.min(...g.pts.map(([x, y]) => Math.hypot(p[0] - x, p[1] - y)));
    case 'group':
      return Math.min(Infinity, ...g.items.map((i) => distanceToGeo(i, p)));
    case 'cut':
      return insideGeo(g.b, p) ? Infinity : distanceToGeo(g.a, p);
    case 'common':
      return insideGeo(g.b, p) ? distanceToGeo(g.a, p) : Infinity;
    default:
      return Infinity;
  }
}

/** The object at p: curves and points within `tolerance` first, then the topmost surface. */
export function objectAt(objects: SeqObject[], p: Pt, tolerance: number): string | null {
  let best: string | null = null, bestD = tolerance;
  for (const o of objects) {
    if (o.dim === 2) continue;
    const d = distanceToGeo(o.geo, p);
    if (d <= bestD) [best, bestD] = [o.name, d];
  }
  if (best) return best;
  for (let i = objects.length - 1; i >= 0; i--) {
    if (objects[i].dim === 2 && insideGeo(objects[i].geo, p)) return objects[i].name;
  }
  return null;
}

/** Signed area of the surface (shoelace; exact for fills, for tests and checks). */
export function fillArea(g: Geo): number {
  if (g.op !== 'fill') return NaN;
  return Math.abs(
    g.loops.reduce((s, l) => s + l.reduce((a, [x, y], i) => a + x * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * y, 0), 0) / 2,
  );
}
