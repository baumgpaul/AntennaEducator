import { describe, it, expect } from 'vitest';
import type { MeshData, SolveResult } from '../api';
import { TEMPLATES, type FemModel } from '../model';
import { meshKey, progress, shapesKey, solveKey, type StudioState } from '../studioState';

const coax = () => structuredClone(TEMPLATES.find((t) => t.id === 'coax')!.model) as FemModel;
const meshData = (domains: string[], boundaries: string[]) =>
  ({ domain_names: domains, boundaries: Object.fromEntries(boundaries.map((b) => [b, [0]])) }) as unknown as MeshData;

function meshed(model: FemModel, data = meshData(['dielectric'], ['inner', 'outer'])): StudioState {
  return { model, issues: [], mesh: { key: meshKey(model), shapesKey: shapesKey(model), data, warnings: [] } };
}

describe('FEM Studio progress', () => {
  it('geometry is done only once the current shapes are meshed', () => {
    const model = coax();
    expect(progress({ model, issues: [] }).done.has('geometry')).toBe(false);
    expect(progress(meshed(model)).done.has('geometry')).toBe(true);
  });

  it('a complete model with a current mesh and solution is done everywhere', () => {
    const model = coax();
    const state = { ...meshed(model), result: { key: solveKey(model), data: {} as SolveResult } };
    expect([...progress(state).done].sort()).toEqual(['geometry', 'materials', 'mesh', 'physics', 'results', 'solve']);
  });

  it('editing a dimension makes the mesh and the solution out of date', () => {
    const model = coax();
    const state = { ...meshed(model), result: { key: solveKey(model), data: {} as SolveResult } };
    const edited = { ...state, model: { ...model, parameters: { ...model.parameters, b: 0.002 } } };
    const p = progress(edited);
    expect(p.done.has('geometry')).toBe(false);
    expect(p.done.has('solve')).toBe(false);
  });

  it('changing only the element size keeps the domains but needs a new mesh', () => {
    const model = coax();
    const finer = { ...meshed(model), model: { ...model, mesh: { ...model.mesh, size: 0.0001 } } };
    const p = progress(finer);
    expect(p.done.has('physics')).toBe(true);
    expect(p.done.has('mesh')).toBe(false);
  });

  it('flags a domain without material and a missing fixed potential', () => {
    const model = { ...coax(), materials: { other: { name: 'Air', relative_permittivity: 1 } } };
    const p = progress(meshed(model));
    expect(p.done.has('materials')).toBe(false);
    expect(p.notes.materials?.[0]).toMatch(/dielectric/);

    const noGround = {
      ...coax(),
      boundary_conditions: [{ type: 'surface_charge_density' as const, boundary: 'inner', value: 1e-6 }],
    };
    const q = progress(meshed(noGround));
    expect(q.done.has('physics')).toBe(false);
    expect(q.notes.physics?.[0]).toMatch(/V is undefined/);
  });

  it('flags conditions on boundaries that no longer exist', () => {
    const p = progress(meshed(coax(), meshData(['dielectric'], ['ring', 'outer'])));
    expect(p.attention.has('physics')).toBe(true);
    expect(p.notes.physics?.join()).toMatch(/"inner" is no longer a boundary/);
  });

  it('shows checklist errors from the service on their tab', () => {
    const state = {
      ...meshed(coax()),
      issues: [{ severity: 'error' as const, step: 'mesh' as const, message: 'Too fine', why: '' }],
    };
    expect(progress(state).notes.mesh).toEqual(['Too fine']);
  });

  it('checks every expression before anything is sent', () => {
    const model = { ...coax(), mesh: { ...coax().mesh, size: 'b/' } };
    const p = progress(meshed(model));
    expect(p.done.has('mesh')).toBe(false);
    expect(p.notes.mesh?.[0]).toMatch(/max size/);

    const potential = {
      ...coax(),
      boundary_conditions: [
        { type: 'potential' as const, boundary: 'inner', value: 'U*x + V9' },
        { type: 'ground' as const, boundary: 'outer' },
      ],
    };
    const q = progress(meshed(potential));
    expect(q.done.has('physics')).toBe(false);
    expect(q.notes.physics?.join()).toMatch(/potential on inner: Unknown parameter "V9"/);

    const spatial = { ...potential, boundary_conditions: [{ ...potential.boundary_conditions[0], value: 'U*x' }, potential.boundary_conditions[1]] };
    expect(progress(meshed(spatial)).done.has('physics')).toBe(true); // x and y are allowed there
  });
});
