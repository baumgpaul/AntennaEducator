/**
 * Which steps are done, from the model and the results computed for it.
 * Every result carries the key of the inputs it was computed from, so any
 * edit makes the results that depend on it out of date — and the tab shows it.
 */
import type { Issue, MeshData, SolveResult } from './api';
import { geometryOf, isDirichlet, keyOf, problemOf, type FemModel } from './model';
import type { FemStepId } from './workflow';
import { evaluateShapes } from './views/geometryDraw';

export interface StudioState {
  model: FemModel;
  mesh?: { key: string; shapesKey: string; data: MeshData; warnings: string[] };
  result?: { key: string; data: SolveResult };
  issues: Issue[];
}

/** The shapes alone (without mesh settings): what the Geometry step is about. */
export const shapesKey = (m: FemModel) =>
  keyOf({ parameters: m.parameters, shapes: m.shapes, holes: m.holes, selections: m.selections });
export const meshKey = (m: FemModel) => keyOf(geometryOf(m));
export const solveKey = (m: FemModel) => keyOf({ geometry: geometryOf(m), problem: problemOf(m) });

export interface Progress {
  done: Set<FemStepId>;
  attention: Set<FemStepId>;
  /** Why a step needs attention, shown on its tab */
  notes: Partial<Record<FemStepId, string[]>>;
  domains: string[];
  boundaries: string[];
}

export function progress(state: StudioState): Progress {
  const { model, mesh, result } = state;
  const done = new Set<FemStepId>();
  const attention = new Set<FemStepId>();
  const notes: Progress['notes'] = {};
  const note = (step: FemStepId, text: string) => {
    attention.add(step);
    (notes[step] ??= []).push(text);
  };

  const drawn = evaluateShapes(model);
  if (drawn.error) note('geometry', drawn.error);
  const shapesMeshed = mesh && mesh.shapesKey === shapesKey(model);
  const domains = shapesMeshed ? mesh!.data.domain_names : [];
  const boundaries = shapesMeshed ? Object.keys(mesh!.data.boundaries).sort() : [];
  if (model.shapes.length > 0 && !drawn.error && shapesMeshed) done.add('geometry');

  if (done.has('geometry')) {
    const missing = domains.filter((d) => !model.materials[d]);
    if (missing.length === 0) done.add('materials');
    else if (Object.keys(model.materials).length > 0) note('materials', `No material yet: ${missing.join(', ')}`);
  }

  if (done.has('materials')) {
    const unknown = model.boundary_conditions.filter((bc) => !boundaries.includes(bc.boundary));
    unknown.forEach((bc) => note('physics', `"${bc.boundary}" is no longer a boundary of the geometry`));
    model.sources
      .filter((s) => !domains.includes(s.domain))
      .forEach((s) => note('physics', `"${s.domain}" is no longer a domain`));
    const hasFixedPotential = model.boundary_conditions.some(isDirichlet);
    if (!hasFixedPotential && model.boundary_conditions.length > 0) {
      note('physics', 'Fix the potential somewhere (ground or potential): otherwise V is undefined');
    }
    if (hasFixedPotential && unknown.length === 0 && !attention.has('physics')) done.add('physics');
  }

  for (const issue of state.issues) {
    if (issue.severity === 'error') note(issue.step, issue.message);
  }

  if (done.has('physics') && mesh && mesh.key === meshKey(model)) done.add('mesh');
  if (done.has('mesh') && result && result.key === solveKey(model)) {
    done.add('solve');
    done.add('results');
  }
  return { done, attention, notes, domains, boundaries };
}
