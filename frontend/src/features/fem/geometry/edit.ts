/** Edits of the geometry sequence that keep the rest of the model consistent. */
import type { FemModel, MeshControl, Step } from '../model';

/** Names in use: steps and selections share one namespace. */
export const takenNames = (m: FemModel) => [...m.steps.map((s) => s.name), ...m.selections.map((s) => s.name)];

export function uniqueName(prefix: string, taken: string[]): string {
  let i = 1;
  while (taken.includes(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** An interface name a|b (sorted, like the mesher) with one side renamed. */
function renameBoundary(boundary: string, old: string, name: string): string {
  if (boundary === old) return name;
  const parts = boundary.split('|');
  if (parts.length !== 2 || !parts.includes(old)) return boundary;
  return parts
    .map((p) => (p === old ? name : p))
    .sort()
    .join('|');
}

function mapRefs(step: Step, f: (names: string[]) => string[]): Step {
  if ('curves' in step) return { ...step, curves: f(step.curves) };
  if ('tools' in step) return { ...step, objects: f(step.objects), tools: f(step.tools) };
  if ('objects' in step) return { ...step, objects: f(step.objects) };
  return step;
}

/**
 * Rename an object (its step) or a selection everywhere it is used: later
 * steps, holes, selections, mesh controls, materials, conditions, sources.
 */
export function renameObject(m: FemModel, old: string, name: string): FemModel {
  if (old === name) return m;
  const r = (n: string) => (n === old ? name : n);
  const rb = (b: string) => renameBoundary(b, old, name);
  return {
    ...m,
    steps: m.steps.map((s) => mapRefs(s.name === old ? { ...s, name } : s, (ns) => ns.map(r))),
    holes: m.holes.map(r),
    selections: m.selections.map((s) => {
      const renamed = s.name === old ? { ...s, name } : s;
      return renamed.kind === 'boundary_of' ? { ...renamed, domains: renamed.domains.map(r) } : renamed;
    }),
    mesh: { ...m.mesh, controls: m.mesh.controls.map((c) => ({ ...c, target: rb(c.target) })) },
    materials: Object.fromEntries(Object.entries(m.materials).map(([k, v]) => [r(k), v])),
    boundary_conditions: m.boundary_conditions.map((bc) => ({ ...bc, boundary: rb(bc.boundary) })),
    sources: m.sources.map((s) => ({ ...s, domain: r(s.domain) })),
  };
}

/** Remove a step; later steps forget it (a boolean's inputs come back as objects). */
export function deleteStep(m: FemModel, index: number): FemModel {
  const name = m.steps[index].name;
  const drop = (ns: string[]) => ns.filter((n) => n !== name);
  return {
    ...m,
    steps: m.steps.filter((_, i) => i !== index).map((s) => mapRefs(s, drop)),
    holes: drop(m.holes),
    selections: m.selections.map((s) => (s.kind === 'boundary_of' ? { ...s, domains: drop(s.domains) } : s)),
    mesh: { ...m.mesh, controls: m.mesh.controls.filter((c) => c.target !== name) },
  };
}

/** Move a step earlier (-1) or later (+1) in the sequence (the painter's order). */
export function moveStep(m: FemModel, index: number, delta: -1 | 1): FemModel {
  const j = index + delta;
  if (j < 0 || j >= m.steps.length) return m;
  const steps = [...m.steps];
  [steps[index], steps[j]] = [steps[j], steps[index]];
  return { ...m, steps };
}

export function replaceStep(m: FemModel, index: number, step: Step): FemModel {
  const old = m.steps[index].name;
  const renamed = step.name !== old ? renameObject(m, old, step.name) : m;
  return { ...renamed, steps: renamed.steps.map((s, i) => (i === index ? step : s)) };
}

export const controlOf = (m: FemModel, target: string) => m.mesh.controls.find((c) => c.target === target);

/** Set (merge) or remove the mesh control of a target; an empty control is removed. */
export function setControl(m: FemModel, target: string, change: Partial<MeshControl> | null): FemModel {
  const old = controlOf(m, target);
  const next = change && { ...(old ?? { target }), ...change, target };
  const empty =
    !next ||
    ((next.size === undefined || next.size === null || next.size === '') &&
      (next.divisions === undefined || next.divisions === null || next.divisions === '') &&
      !next.structured &&
      !next.boundary_layer);
  const others = m.mesh.controls.filter((c) => c.target !== target);
  const controls = empty ? others : old ? m.mesh.controls.map((c) => (c.target === target ? next! : c)) : [...others, next!];
  return { ...m, mesh: { ...m.mesh, controls } };
}

export function toggleHole(m: FemModel, name: string, hole: boolean): FemModel {
  return { ...m, holes: hole ? [...m.holes.filter((h) => h !== name), name] : m.holes.filter((h) => h !== name) };
}
