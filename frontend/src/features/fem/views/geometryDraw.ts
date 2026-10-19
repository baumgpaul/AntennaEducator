/** Evaluated shapes for drawing, and shared colors. */
import { evaluate, evaluateParameters, ExpressionError } from '../expressions';
import type { FemModel, Shape } from '../model';

export type Drawn =
  | { kind: 'rect'; name: string; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; name: string; cx: number; cy: number; r: number }
  | { kind: 'polygon'; name: string; points: [number, number][] };

export interface Bounds {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/** Shapes with numbers instead of expressions, or the first error. */
export function evaluateShapes(model: FemModel): { shapes: Drawn[]; error?: string; bounds: Bounds } {
  let values: Record<string, number>;
  try {
    values = evaluateParameters(model.parameters);
  } catch (e) {
    return { shapes: [], error: `Parameters: ${(e as Error).message}`, bounds: EMPTY };
  }
  const shapes: Drawn[] = [];
  for (const s of model.shapes) {
    try {
      shapes.push(drawShape(s, values));
    } catch (e) {
      if (!(e instanceof ExpressionError)) throw e;
      return { shapes, error: `${s.name}: ${e.message}`, bounds: boundsOf(shapes) };
    }
  }
  return { shapes, bounds: boundsOf(shapes) };
}

function drawShape(s: Shape, v: Record<string, number>): Drawn {
  const ev = (e: Parameters<typeof evaluate>[0]) => evaluate(e, v);
  if (s.kind === 'rectangle') return { kind: 'rect', name: s.name, x: ev(s.x), y: ev(s.y), w: ev(s.width), h: ev(s.height) };
  if (s.kind === 'circle') return { kind: 'circle', name: s.name, cx: ev(s.cx), cy: ev(s.cy), r: ev(s.r) };
  return { kind: 'polygon', name: s.name, points: s.points.map(([x, y]) => [ev(x), ev(y)] as [number, number]) };
}

const EMPTY: Bounds = { xmin: -1, ymin: -1, xmax: 1, ymax: 1 };

export function boundsOf(shapes: Drawn[]): Bounds {
  if (shapes.length === 0) return EMPTY;
  const b = { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity };
  const add = (x: number, y: number) => {
    b.xmin = Math.min(b.xmin, x);
    b.ymin = Math.min(b.ymin, y);
    b.xmax = Math.max(b.xmax, x);
    b.ymax = Math.max(b.ymax, y);
  };
  for (const s of shapes) {
    if (s.kind === 'rect') {
      add(s.x, s.y);
      add(s.x + s.w, s.y + s.h);
    } else if (s.kind === 'circle') {
      add(s.cx - s.r, s.cy - s.r);
      add(s.cx + s.r, s.cy + s.r);
    } else s.points.forEach(([x, y]) => add(x, y));
  }
  return b;
}

/** Distinct, colour-blind-friendly domain colours (Okabe–Ito). */
export const DOMAIN_COLORS = ['#56B4E9', '#E69F00', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'];

export const colorOf = (index: number) => DOMAIN_COLORS[index % DOMAIN_COLORS.length];

/** Viridis-like colour map, t in [0, 1]. */
const STOPS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];
export function colormap(t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const c = STOPS[i].map((a, k) => Math.round(a + f * (STOPS[i + 1][k] - a)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Engineering format with SI prefix: 3.54e-10 F → "354 pF". */
export function si(value: number, unit: string, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return `0 ${unit}`;
  const prefixes = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G'];
  const exp = Math.max(-5, Math.min(3, Math.floor(Math.log10(Math.abs(value)) / 3)));
  return `${(value / 10 ** (3 * exp)).toPrecision(digits)} ${prefixes[exp + 5]}${unit}`;
}
