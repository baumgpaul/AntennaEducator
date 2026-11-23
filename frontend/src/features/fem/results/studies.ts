/**
 * Studies: the same model solved several times — on finer and finer meshes
 * (does the answer converge, and how fast?) or for a range of one parameter
 * (how does the result depend on it?). Each point is one summary solve.
 */
import { femError, type SolveSummary } from '../api';
import { evaluate, evaluateParameters, type Expr } from '../expressions';
import { TEMPLATES, type FemModel, type FemView, type StudyPoint, type StudyQuantity } from '../model';
import { solveKey } from '../studioState';

export type StudyView = Extract<FemView, { type: 'convergence' | 'sweep' }>;

const tidy = (v: number) => Number(v.toPrecision(6));
const scaleExpr = (e: Expr, f: number): Expr => (typeof e === 'number' ? tidy(e * f) : `(${e})*${tidy(f)}`);

/** Mesh scale factors: twice the model's element size, then smaller by √2 each step (1 is the model's own mesh). */
export function convergenceFactors(steps: number): number[] {
  return Array.from({ length: steps }, (_, k) => tidy(2 ** (1 - k / 2)));
}

/**
 * The model with every element size scaled by f — also on boundaries and in
 * domains, and with more elements per circle, so curved edges are refined too
 * (otherwise their polygon approximation would stop the convergence).
 */
export function scaleMesh(model: FemModel, f: number): FemModel {
  const scaleAll = (sizes: Record<string, Expr>) => Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, scaleExpr(v, f)]));
  return {
    ...model,
    mesh: {
      ...model.mesh,
      size: scaleExpr(model.mesh.size, f),
      boundary_sizes: scaleAll(model.mesh.boundary_sizes),
      domain_sizes: scaleAll(model.mesh.domain_sizes),
      elements_per_circle: Math.max(4, Math.round(model.mesh.elements_per_circle / f)),
    },
  };
}

/** Evenly spaced parameter values, ends included. */
export function sweepValues(view: Extract<FemView, { type: 'sweep' }>, model: FemModel): number[] {
  const p = evaluateParameters(model.parameters);
  const [a, b] = [evaluate(view.from, p), evaluate(view.to, p)];
  const n = Math.max(2, view.steps);
  return Array.from({ length: n }, (_, k) => tidy(a + ((b - a) * k) / (n - 1)));
}

export const withParameter = (model: FemModel, name: string, value: number): FemModel => ({
  ...model,
  parameters: { ...model.parameters, [name]: value },
});

/** The models a study solves, with the x of each point. */
export function studyModels(view: StudyView, model: FemModel): { x: number; model: FemModel }[] {
  if (view.type === 'convergence') return convergenceFactors(view.steps).map((f) => ({ x: f, model: scaleMesh(model, f) }));
  if (!(view.parameter in model.parameters)) throw new Error(`There is no parameter "${view.parameter}"`);
  return sweepValues(view, model).map((x) => ({ x, model: withParameter(model, view.parameter, x) }));
}

/** The textbook value for a model, where its template has one (capacitance only). */
export function analyticValue(model: FemModel, quantity: StudyQuantity): number | null {
  const analytic = TEMPLATES.find((t) => t.id === model.template)?.analytic;
  if (!analytic || quantity !== analytic.quantity) return null;
  try {
    const v = analytic.value(evaluateParameters(model.parameters), model);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** The textbook value only where it is the exact limit of the FEM model (else null). */
export function exactValue(model: FemModel, quantity: StudyQuantity): number | null {
  const exact = TEMPLATES.find((t) => t.id === model.template)?.analytic?.exact;
  return exact ? analyticValue(model, quantity) : null;
}

export function valueOf(s: SolveSummary, quantity: StudyQuantity): number {
  if (quantity === 'energy') return s.energy;
  if (!s.capacitance) throw new Error('No capacitance: it needs one grounded and one other electrode at a fixed potential');
  return s.capacitance.from_energy;
}

/** A key for "the model a study belongs to": its geometry and physics, not its views. */
export const studyKey = (view: StudyView, model: FemModel) => `${view.type}:${solveKey(model)}`;

/**
 * Solve the study's models one after another (each is one request, so long
 * studies show progress and can be cancelled). A failing point is recorded
 * and the study goes on; cancelling keeps the points done so far.
 */
export async function runStudy(
  items: { x: number; model: FemModel }[],
  quantity: StudyQuantity,
  solve: (m: FemModel, signal?: AbortSignal) => Promise<SolveSummary>,
  onProgress: (points: StudyPoint[]) => void,
  signal?: AbortSignal,
): Promise<StudyPoint[]> {
  const points: StudyPoint[] = [];
  for (const item of items) {
    if (signal?.aborted) break;
    try {
      const s = await solve(item.model, signal);
      points.push({ x: item.x, nodes: s.nodes, value: valueOf(s, quantity), seconds: s.seconds });
    } catch (e) {
      if (signal?.aborted) break;
      points.push({ x: item.x, error: femError(e).message });
    }
    onProgress([...points]);
  }
  return points;
}

/** Least-squares slope of log y over log x. */
export function logSlope(xs: number[], ys: number[]): number | null {
  const pts = xs.map((x, i) => [Math.log(x), Math.log(ys[i])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pts.length < 2) return null;
  const mx = pts.reduce((s, [a]) => s + a, 0) / pts.length;
  const my = pts.reduce((s, [, b]) => s + b, 0) / pts.length;
  const sxx = pts.reduce((s, [a]) => s + (a - mx) ** 2, 0);
  if (sxx === 0) return null;
  return pts.reduce((s, [a, b]) => s + (a - mx) * (b - my), 0) / sxx;
}

/**
 * Richardson extrapolation from the three finest meshes: fits f(h) = f∞ + a·h^p
 * through them (any size ratios) and returns f∞ and the observed order p.
 * Null unless the three converge monotonically with a plausible order.
 */
export function richardson(points: StudyPoint[]): { value: number; order: number } | null {
  const ok = points.filter((p) => p.value != null && p.x > 0).sort((a, b) => b.x - a.x);
  if (ok.length < 3) return null;
  const [p1, p2, p3] = ok.slice(-3);
  const [h1, h2, h3] = [p1.x, p2.x, p3.x];
  const [f1, f2, f3] = [p1.value!, p2.value!, p3.value!];
  const d1 = f1 - f2;
  const d2 = f2 - f3;
  if (!(h1 > h2 && h2 > h3) || d2 === 0 || d1 / d2 <= 1) return null;
  // (h1^p − h2^p)/(h2^p − h3^p) grows with p: solve for the measured ratio by bisection
  const ratio = (p: number) => (h1 ** p - h2 ** p) / (h2 ** p - h3 ** p);
  let [lo, hi] = [0.2, 8];
  if (d1 / d2 < ratio(lo) || d1 / d2 > ratio(hi)) return null;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (ratio(mid) < d1 / d2) lo = mid;
    else hi = mid;
  }
  const order = (lo + hi) / 2;
  return { value: f3 - (d2 * h3 ** order) / (h2 ** order - h3 ** order), order };
}

/**
 * Errors of a convergence study, against the best available reference:
 * an exact value (coax formula), else the Richardson extrapolation of the
 * three finest meshes, else the finest mesh itself (which then has no error).
 * A textbook value that leaves physics out (plates without fringing) is no
 * reference: the error would stall at the physics it misses.
 * `orderH` is the slope over the element size h: in 2D, N ∝ 1/h², so
 * error ∝ N^s means error ∝ h^(−2s).
 */
export function convergence(points: StudyPoint[], exact: number | null) {
  const ok = points.filter((p): p is Required<Pick<StudyPoint, 'nodes' | 'value'>> & StudyPoint => p.value != null && p.nodes != null);
  const finest = ok.length ? ok.reduce((a, b) => (b.nodes > a.nodes ? b : a)) : null;
  const extrapolated = exact == null ? richardson(points) : null;
  const against = exact != null ? ('analytic' as const) : extrapolated ? ('extrapolated' as const) : ('finest' as const);
  const reference = exact ?? extrapolated?.value ?? finest?.value ?? null;
  const errors = points.map((p) =>
    reference == null || p.value == null || (against === 'finest' && p === finest) ? null : Math.abs(p.value / reference - 1),
  );
  const used = points.map((p, i) => ({ n: p.nodes, e: errors[i] })).filter((q): q is { n: number; e: number } => q.n != null && q.e != null && q.e > 0);
  const slope = logSlope(
    used.map((q) => q.n),
    used.map((q) => q.e),
  );
  return { errors, against, reference, order: extrapolated?.order ?? null, slope, orderH: slope == null ? null : -2 * slope };
}
