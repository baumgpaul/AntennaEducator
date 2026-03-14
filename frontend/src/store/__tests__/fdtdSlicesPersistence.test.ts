/**
 * Tests for FDTD design slice loadFdtdDesign reducer.
 * Pure Redux logic — no DOM needed.
 */
import { describe, it, expect } from 'vitest';
import fdtdDesignReducer, {
  loadFdtdDesign,
  resetDesign,
  addSource,
  setDimensionality,
  markClean,
} from '@/store/fdtdDesignSlice';
import fdtdSolverReducer, {
  loadFdtdSolverState,
  clearResults,
} from '@/store/fdtdSolverSlice';
import type { DomainBoundaries } from '@/types/fdtd';

describe('fdtdDesignSlice — loadFdtdDesign', () => {
  it('should hydrate full design state from project blob', () => {
    const initial = fdtdDesignReducer(undefined, { type: '@@INIT' });
    const boundaries: DomainBoundaries = {
      x_min: { type: 'pec' },
      x_max: { type: 'pec' },
      y_min: { type: 'mur_abc' },
      y_max: { type: 'mur_abc' },
      z_min: { type: 'mur_abc' },
      z_max: { type: 'mur_abc' },
    };

    const state = fdtdDesignReducer(
      initial,
      loadFdtdDesign({
        dimensionality: '2d',
        domainSize: [2.0, 1.5, 0.01],
        cellSize: [0.01, 0.01, 0.01],
        structures: [
          {
            id: 's1',
            name: 'Dielectric',
            type: 'box',
            position: [0.5, 0.5, 0],
            dimensions: { width: 0.3, height: 0.3, depth: 0.01 },
            material: 'dielectric',
          },
        ],
        sources: [
          {
            id: 'src1',
            name: 'Source 1',
            type: 'gaussian_pulse',
            position: [1.0, 0.75, 0],
            parameters: { amplitude: 1.0, width: 30 },
            polarization: 'z',
          },
        ],
        boundaries,
        probes: [
          {
            id: 'p1',
            name: 'Probe 1',
            type: 'point',
            position: [1.5, 0.75, 0],
            fields: ['Ez'],
          },
        ],
        config: {
          num_time_steps: 2000,
          courant_number: 0.5,
          output_every_n_steps: 5,
          dft_frequencies: [1e9],
          auto_shutoff_threshold: 1e-8,
        },
      }),
    );

    expect(state.dimensionality).toBe('2d');
    expect(state.domainSize).toEqual([2.0, 1.5, 0.01]);
    expect(state.cellSize).toEqual([0.01, 0.01, 0.01]);
    expect(state.structures).toHaveLength(1);
    expect(state.structures[0].name).toBe('Dielectric');
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0].name).toBe('Source 1');
    expect(state.boundaries.x_min.type).toBe('pec');
    expect(state.probes).toHaveLength(1);
    expect(state.config.num_time_steps).toBe(2000);
    expect(state.config.courant_number).toBe(0.5);
    expect(state.isDirty).toBe(false);
  });

  it('should handle partial loads (only sources changed)', () => {
    const initial = fdtdDesignReducer(undefined, { type: '@@INIT' });
    const state = fdtdDesignReducer(
      initial,
      loadFdtdDesign({
        sources: [
          {
            id: 'src1',
            name: 'My Source',
            type: 'sinusoidal',
            position: [0.5, 0, 0],
            parameters: { frequency: 1e9, amplitude: 1.0 },
            polarization: 'z',
          },
        ],
      }),
    );

    // Sources changed
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0].type).toBe('sinusoidal');
    // Other defaults preserved
    expect(state.dimensionality).toBe('1d');
    expect(state.isDirty).toBe(false);
  });

  it('should reset isDirty to false on load', () => {
    // Start with dirty state
    let state = fdtdDesignReducer(undefined, { type: '@@INIT' });
    state = fdtdDesignReducer(state, setDimensionality('2d'));
    expect(state.isDirty).toBe(true);

    // Load should reset dirty
    state = fdtdDesignReducer(state, loadFdtdDesign({ dimensionality: '1d' }));
    expect(state.isDirty).toBe(false);
  });

  it('should round-trip design state correctly', () => {
    let state = fdtdDesignReducer(undefined, { type: '@@INIT' });
    state = fdtdDesignReducer(state, setDimensionality('2d'));
    state = fdtdDesignReducer(
      state,
      addSource({
        name: 'Test Src',
        type: 'gaussian_pulse',
        position: [0.5, 0.5, 0],
        parameters: { amplitude: 1, width: 30 },
        polarization: 'z',
      }),
    );

    // Simulate save blob
    const blob = {
      dimensionality: state.dimensionality as '1d' | '2d',
      domainSize: state.domainSize as [number, number, number],
      cellSize: state.cellSize as [number, number, number],
      structures: state.structures,
      sources: state.sources,
      boundaries: state.boundaries,
      probes: state.probes,
      config: state.config,
    };

    // Reset and reload
    const fresh = fdtdDesignReducer(undefined, resetDesign());
    const restored = fdtdDesignReducer(fresh, loadFdtdDesign(blob));

    expect(restored.dimensionality).toBe(state.dimensionality);
    expect(restored.domainSize).toEqual(state.domainSize);
    expect(restored.sources).toHaveLength(1);
    expect(restored.sources[0].name).toBe('Test Src');
    expect(restored.isDirty).toBe(false);
  });
});

describe('fdtdSolverSlice — loadFdtdSolverState', () => {
  it('should restore solver results from project blob', () => {
    const initial = fdtdSolverReducer(undefined, { type: '@@INIT' });
    const mockResults = {
      dimensionality: '1d',
      mode: 'tm',
      total_time_steps: 500,
      dt: 1.67e-11,
      solve_time_s: 0.42,
      fields_final: { Ez: [0, 0.1, 0.5, 0.3, 0] },
      probe_data: [],
      dft_results: {},
    };

    const state = fdtdSolverReducer(
      initial,
      loadFdtdSolverState({
        results: mockResults as any,
        mode: 'tm',
        status: 'completed',
      }),
    );

    expect(state.results).not.toBeNull();
    expect(state.results!.total_time_steps).toBe(500);
    expect(state.status).toBe('completed');
    expect(state.mode).toBe('tm');
    expect(state.progress).toBe(100);
    expect(state.error).toBeNull();
  });

  it('should handle null results gracefully', () => {
    const initial = fdtdSolverReducer(undefined, { type: '@@INIT' });
    const state = fdtdSolverReducer(
      initial,
      loadFdtdSolverState({
        results: null,
        status: 'idle',
      }),
    );

    expect(state.results).toBeNull();
    expect(state.status).toBe('idle');
    expect(state.progress).toBe(0);
  });

  it('should clear results after load', () => {
    const initial = fdtdSolverReducer(undefined, { type: '@@INIT' });
    let state = fdtdSolverReducer(
      initial,
      loadFdtdSolverState({
        results: { dimensionality: '1d', mode: 'tm', total_time_steps: 100, dt: 1e-11, solve_time_s: 0.1, fields_final: {}, probe_data: [], dft_results: {} } as any,
        status: 'completed',
      }),
    );
    expect(state.results).not.toBeNull();

    state = fdtdSolverReducer(state, clearResults());
    expect(state.results).toBeNull();
    expect(state.status).toBe('idle');
  });
});
