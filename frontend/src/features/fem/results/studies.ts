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
 * Errors of a convergence study: against the textbook value where there is
 * one, otherwise against the finest mesh (which then has no error of its own).
 * The order is the slope over the element size h: in 2D, N ∝ 1/h², so
 * error ∝ N^s means error ∝ h^(−2s).
 */
export function convergence(points: StudyPoint[], reference: number | null) {
  const ok = points.filter((p): p is Required<Pick<StudyPoint, 'nodes' | 'value'>> & StudyPoint => p.value != null && p.nodes != null);
  const finest = ok.length ? ok.reduce((a, b) => (b.nodes > a.nodes ? b : a)) : null;
  const ref = reference ?? finest?.value ?? null;
  const errors = points.map((p) =>
    ref == null || p.value == null || (reference == null && p === finest) ? null : Math.abs(p.value / ref - 1),
  );
  const used = points.map((p, i) => ({ n: p.nodes, e: errors[i] })).filter((q): q is { n: number; e: number } => q.n != null && q.e != null && q.e > 0);
  const slope = logSlope(
    used.map((q) => q.n),
    used.map((q) => q.e),
  );
  return { errors, against: reference != null ? ('analytic' as const) : ('finest' as const), slope, orderH: slope == null ? null : -2 * slope };
}
