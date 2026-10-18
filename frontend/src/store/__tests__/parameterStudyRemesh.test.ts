/**
 * Parameter study remeshing (TEST_PLAN B30) and geometry restore on failure (B31).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const { createDipole, solveMultiAntenna } = vi.hoisted(() => ({
  createDipole: vi.fn(),
  solveMultiAntenna: vi.fn(),
}));
vi.mock('@/api/preprocessor', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createDipole,
}));
vi.mock('@/api/solver', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  solveMultiAntenna,
}));

import designReducer from '../designSlice';
import solverReducer from '../solverSlice';
import variablesReducer from '../variablesSlice';
import { runParameterStudy } from '../parameterStudyThunks';
import { geometryChanged } from '@/types/parameterStudy';

const MESH = {
  nodes: [
    [0, 0, -0.25],
    [0, 0, 0],
    [0, 0, 0.25],
  ],
  edges: [
    [1, 2],
    [2, 3],
  ],
  radii: [0.001, 0.001],
};

function makeStore(lengthExpression: string, extraVariables: { name: string; expression: string }[] = []) {
  const variables = variablesReducer(undefined, { type: 'init' });
  return configureStore({
    reducer: { design: designReducer, solver: solverReducer, variables: variablesReducer },
    preloadedState: {
      variables: { ...variables, variables: [...variables.variables, ...extraVariables] },
      design: {
        ...designReducer(undefined, { type: 'init' }),
        elements: [
          {
            id: 'el-1',
            name: 'Dipole',
            type: 'dipole',
            visible: true,
            locked: false,
            color: '#f00',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            config: { length: 0.5, wire_radius: 0.001, gap: 0.01, segments: 2 },
            expressions: { length: lengthExpression },
            mesh: MESH,
            sources: [{ type: 'voltage', amplitude: { real: 1, imag: 0 }, node_start: 2, node_end: 0 }],
            lumped_elements: [],
          },
        ],
      } as never,
    },
  });
}

const sweep = (variableName: string) => ({
  sweepVariables: [{ variableName, min: 1, max: 3, numPoints: 3, spacing: 'linear' as const }],
});

describe('parameter study remeshing (B30)', () => {
  beforeEach(() => {
    createDipole.mockReset().mockResolvedValue({ element: { sources: [] }, mesh: MESH, message: '' });
    solveMultiAntenna.mockReset().mockResolvedValue({
      frequency: 3e8,
      converged: true,
      antenna_solutions: [],
      n_total_nodes: 3,
      n_total_edges: 2,
      solve_time: 0,
    });
  });

  it('does not remesh when the swept variable does not affect geometry', async () => {
    const store = makeStore('0.5', [{ name: 'frequency', expression: '3e8' }]);
    await store.dispatch(
      runParameterStudy({
        sweepVariables: [
          { variableName: 'frequency', min: 1e8, max: 3e8, numPoints: 3, spacing: 'linear' },
        ],
      }),
    );
    // Only the final restore of the nominal geometry
    expect(createDipole).toHaveBeenCalledTimes(1 /* first point */ + 1 /* restore */);
  });

  it('remeshes at every point when geometry depends on the swept frequency', async () => {
    // length = wavelength / 2 with wavelength = C_0 / freq (default variables)
    const store = makeStore('wavelength / 2');
    await store.dispatch(
      runParameterStudy({
        sweepVariables: [
          { variableName: 'freq', min: 1e8, max: 3e8, numPoints: 3, spacing: 'linear' },
        ],
      }),
    );
    const lengths = createDipole.mock.calls.map((c) => (c[0] as { length: number }).length);
    // 3 sweep points with 3 different lengths, then the nominal restore
    expect(new Set(lengths.slice(0, 3)).size).toBe(3);
  });
});

describe('geometry restore on failure (B31)', () => {
  it('restores the nominal geometry when a sweep point fails', async () => {
    createDipole.mockReset().mockResolvedValue({ element: { sources: [] }, mesh: MESH, message: '' });
    solveMultiAntenna.mockReset().mockRejectedValue(new Error('solver down'));
    const store = makeStore('L', [{ name: 'L', expression: '0.5' }]);

    const result = await store.dispatch(runParameterStudy(sweep('L')));

    expect(result.meta.requestStatus).toBe('rejected');
    const lastLength = (createDipole.mock.calls.at(-1)![0] as { length: number }).length;
    expect(lastLength).toBe(0.5); // nominal L, not the swept value 1
  });
});

describe('geometryChanged', () => {
  it('compares resolved values with a relative tolerance', () => {
    expect(geometryChanged(undefined, { length: 1 })).toBe(true);
    expect(geometryChanged({ length: 1 }, { length: 1 })).toBe(false);
    expect(geometryChanged({ length: 1 }, { length: 1 + 1e-15 })).toBe(false);
    expect(geometryChanged({ length: 1 }, { length: 1.01 })).toBe(true);
    expect(geometryChanged({ length: 1 }, { length: 1, gap: 0.01 })).toBe(true);
  });
});

describe('mesh snapshots (B33)', () => {
  beforeEach(() => {
    solveMultiAntenna.mockReset().mockResolvedValue({
      frequency: 3e8,
      converged: true,
      antenna_solutions: [],
      n_total_nodes: 3,
      n_total_edges: 2,
      solve_time: 0,
    });
  });

  it('keep complex source amplitudes (they used to be dropped, i.e. 1 A)', async () => {
    const store = makeStore('0.5', [{ name: 'frequency', expression: '3e8' }]);
    const result = await store.dispatch(
      runParameterStudy({
        sweepVariables: [
          { variableName: 'frequency', min: 1e8, max: 3e8, numPoints: 2, spacing: 'linear' },
        ],
      }),
    );
    const payload = result.payload as { results: Array<{ meshSnapshots?: Array<{ sources?: unknown[] }> }> };
    expect(payload.results[0].meshSnapshots?.[0].sources?.[0]).toMatchObject({
      amplitude: { real: 1, imag: 0 },
    });
  });
});
