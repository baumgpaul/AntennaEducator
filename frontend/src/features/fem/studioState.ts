/**
 * Which steps are done, from the model and the results computed for it.
 * Every result carries the key of the inputs it was computed from, so any
 * edit makes the results that depend on it out of date — and the tab shows it.
 */
import type { Issue, MeshData, SolveResult } from './api';
import { exportOnly, geometryOf, isDirichlet, keyOf, problemOf, type FemModel } from './model';
import type { FemStepId } from './workflow';
import { runSequence } from './geometry/sequence';
import { evaluateParameters, expressionErrors } from './expressions';

export interface StudioState {
  model: FemModel;
  mesh?: { key: string; shapesKey: string; data: MeshData; warnings: string[] };
  result?: { key: string; data: SolveResult };
  issues: Issue[];
}

/** The geometry alone (without mesh settings): what the Geometry step is about. */
export const shapesKey = (m: FemModel) =>
  keyOf({ parameters: m.parameters, steps: m.steps, holes: m.holes, selections: m.selections });
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

  const seq = runSequence(model);
  const geometryOk = seq.errors.length === 0;
  seq.errors.forEach((e) => note('geometry', e));
  const shapesMeshed = mesh && mesh.shapesKey === shapesKey(model);
  const domains = shapesMeshed ? mesh!.data.domain_names : [];
  const boundaries = shapesMeshed ? Object.keys(mesh!.data.boundaries).sort() : [];
  if (model.steps.length > 0 && geometryOk && shapesMeshed) done.add('geometry');

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

  // Expressions outside the geometry, checked before anything is sent
  if (geometryOk) {
    const params = evaluateParameters(model.parameters);
    const set = <T,>(v: T | null | undefined): v is T => v !== undefined && v !== null && v !== '';
    const meshValues = [
      { label: 'max size', expr: model.mesh.size },
      ...(set(model.mesh.min_size) ? [{ label: 'min size', expr: model.mesh.min_size }] : []),
      ...model.mesh.controls.flatMap((c) => [
        ...(set(c.size) ? [{ label: `size at ${c.target}`, expr: c.size }] : []),
        ...(set(c.divisions) ? [{ label: `divisions of ${c.target}`, expr: c.divisions }] : []),
        ...(set(c.grading) ? [{ label: `grading of ${c.target}`, expr: c.grading }] : []),
      ]),
    ];
    expressionErrors(meshValues, params).forEach((e) => note('mesh', e));
    seq.meshErrors.forEach((e) => note('mesh', e));
    const physicsValues = [
      ...model.boundary_conditions.flatMap((bc) =>
        'value' in bc ? [{ label: `${bc.type} on ${bc.boundary}`, expr: bc.value, space: true }] : [],
      ),
      ...model.sources.map((src) => ({ label: `ρ in ${src.domain}`, expr: src.value, space: true })),
    ];
    expressionErrors(physicsValues, params).forEach((e) => note('physics', e));
    if (physicsValues.length && attention.has('physics')) done.delete('physics');
  }

  for (const issue of state.issues) {
    if (issue.severity === 'error') note(issue.step, issue.message);
  }

  if (done.has('physics') && !attention.has('mesh') && mesh && mesh.key === meshKey(model)) done.add('mesh');
  const onlyExport = exportOnly(model);
  if (done.has('mesh') && onlyExport) {
    note('solve', `${onlyExport}: the built-in P1 solver needs linear triangles. Export the model to openCFS to solve it, or switch the mesh back.`);
  }
  if (done.has('mesh') && result && result.key === solveKey(model)) {
    done.add('solve');
    done.add('results');
  }
  return { done, attention, notes, domains, boundaries };
}
