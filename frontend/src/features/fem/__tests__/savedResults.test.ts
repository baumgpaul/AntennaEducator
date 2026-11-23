import { describe, expect, it } from 'vitest';
import type { MeshData, SolveResult } from '../api';
import { fromSaved, toSaved } from '../savedResults';

const mesh = { nodes: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2] } as unknown as MeshData;
const otherMesh = { nodes: [0, 0, 2, 0, 0, 2], triangles: [0, 1, 2] } as unknown as MeshData;
const solve = { mesh, potential: [0, 1, 0.5] } as unknown as SolveResult;

describe('saved FEM results (simulation_results.femResult)', () => {
  it('nothing computed: nothing to save', () => {
    expect(toSaved({})).toBeNull();
    expect(fromSaved(undefined)).toEqual({});
    expect(fromSaved({ version: 2 })).toEqual({});
  });

  it('a mesh alone (after Find domains) round-trips with its keys', () => {
    const computed = { mesh: { key: 'm', shapesKey: 's', data: mesh, warnings: ['coarse'] } };
    const back = fromSaved(JSON.parse(JSON.stringify(toSaved(computed))));
    expect(back).toEqual(computed);
  });

  it('after a solve the mesh is stored once, inside the result, and shared again on load', () => {
    const computed = {
      mesh: { key: 'm', shapesKey: 's', data: mesh, warnings: [] },
      result: { key: 'r', data: solve },
    };
    const saved = toSaved(computed)!;
    expect(saved.mesh).not.toHaveProperty('data');
    const back = fromSaved(JSON.parse(JSON.stringify(saved)));
    expect(back).toEqual(computed);
    expect(back.mesh!.data).toBe(back.result!.data.mesh);
  });

  it('a mesh made after the solve keeps its own data', () => {
    const computed = {
      mesh: { key: 'm2', shapesKey: 's', data: otherMesh, warnings: [] },
      result: { key: 'r', data: solve },
    };
    const back = fromSaved(JSON.parse(JSON.stringify(toSaved(computed))));
    expect(back.mesh!.data).toEqual(otherMesh);
    expect(back.result!.data.mesh).toEqual(mesh);
  });

  it('ignores a damaged entry instead of failing the project', () => {
    expect(fromSaved({ version: 1, mesh: { key: 'm', shapesKey: 's' } })).toEqual({});
    expect(fromSaved({ version: 1, result: { key: 'r', data: {} } })).toEqual({});
    expect(fromSaved('nonsense')).toEqual({});
  });
});
