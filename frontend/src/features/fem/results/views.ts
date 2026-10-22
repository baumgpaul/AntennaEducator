/** Result views of FEM Studio: types, defaults, and line-probe end points. */
import { evaluate, evaluateParameters } from '../expressions';
import type { FemModel, FemView } from '../model';

let counter = 0;
export const newViewId = () => `v${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Names a field view gets from its quantity; a user-chosen name is kept when the quantity changes. */
export const FIELD_NAMES = { potential: 'Potential', E: 'Field strength |E|', D: 'Flux density |D|' } as const;

const round = (v: number) => Number(v.toPrecision(4));

/**
 * A new view; a new line probe crosses the middle of the mesh horizontally,
 * a new sweep varies the first parameter from half to one and a half times its value.
 */
export function newView(
  type: FemView['type'],
  existing: FemView[],
  meshNodes: number[] = [],
  context: { model?: FemModel; capacitance?: boolean } = {},
): FemView {
  const n = existing.filter((v) => v.type === type).length + 1;
  const id = newViewId();
  const quantity = context.capacitance === false ? 'energy' : 'capacitance';
  if (type === 'convergence') return { id, name: n > 1 ? `Mesh convergence ${n}` : 'Mesh convergence', type, quantity, steps: 5 };
  if (type === 'sweep') {
    const params = context.model ? evaluateParameters(context.model.parameters) : {};
    const parameter = Object.keys(params)[0] ?? '';
    const v = params[parameter] ?? 1;
    return { id, name: `Sweep ${parameter || n}`, type, quantity, parameter, from: round(v / 2), to: round(1.5 * v), steps: 6 };
  }
  if (type === 'field') {
    const name = existing.some((v) => v.name === FIELD_NAMES.potential) ? `Field ${n}` : FIELD_NAMES.potential;
    return { id, name, type, quantity: 'potential', contours: true, arrows: true, colorMap: 'viridis' };
  }
  if (type === 'line') {
    const xs = meshNodes.filter((_, i) => i % 2 === 0);
    const ys = meshNodes.filter((_, i) => i % 2 === 1);
    if (!xs.length) return { id, name: `Line probe ${n}`, type, quantity: 'potential', start: [0, 0], end: [0.01, 0] };
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const y = round((Math.min(...ys) + Math.max(...ys)) / 2);
    return { id, name: `Line probe ${n}`, type, quantity: 'potential', start: [round(x0), y], end: [round(x1), y] };
  }
  return { id, name: n > 1 ? `Quantities ${n}` : 'Quantities', type };
}

/** What a model shows after its first solve: the field, the quantities, and for templates a probe line. */
export function defaultViews(model: FemModel): FemView[] {
  const views: FemView[] = [
    { id: 'field', name: FIELD_NAMES.potential, type: 'field', quantity: 'potential', contours: true, arrows: true, colorMap: 'viridis' },
    { id: 'quantities', name: 'Quantities', type: 'quantities' },
  ];
  if (model.template === 'coax') {
    views.push({ id: 'radial', name: 'V along the radius', type: 'line', quantity: 'potential', start: ['a', 0], end: ['b', 0] });
  } else if (model.template === 'plate-capacitor') {
    views.push({ id: 'gap', name: 'V across the gap', type: 'line', quantity: 'potential', start: [0, '-d/2'], end: [0, 'd/2'] });
  }
  return views;
}

/** End points of a line probe in metres, or the reason they cannot be evaluated. */
export function lineEnds(
  view: Extract<FemView, { type: 'line' }>,
  model: FemModel,
): { start: [number, number]; end: [number, number] } | { error: string } {
  try {
    const p = evaluateParameters(model.parameters);
    const ev = (e: (typeof view.start)[number]) => evaluate(e, p);
    return { start: [ev(view.start[0]), ev(view.start[1])], end: [ev(view.end[0]), ev(view.end[1])] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
