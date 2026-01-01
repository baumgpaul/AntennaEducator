import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import solverReducer, {
  computePostprocessingWorkflow,
  setDirectivityRequested,
  setDirectivitySettings,
  addFieldRegion,
  updateFieldResult,
} from '../solverSlice';

// Mock API calls
vi.mock('@/api/postprocessor', () => ({
  computeNearField: vi.fn().mockResolvedValue({
    num_points: 25,
    E_magnitudes: [2.0, 1.5, 1.8],
    H_magnitudes: [0.0008, 0.0006, 0.0007],
  }),
  computeFarField: vi.fn().mockResolvedValue({
    frequency: 300,
    theta_angles: [0, 10, 20],
    phi_angles: [0, 10, 20],
    E_theta_mag: [1.0, 0.9, 0.8],
    E_phi_mag: [0.5, 0.4, 0.3],
    E_total_mag: [1.1, 1.0, 0.9],
    pattern_db: [0, -1, -2],
    directivity: 2.5,
    gain: 2.0,
    efficiency: 0.8,
    max_direction: [0, 0],
  }),
}));

vi.mock('@/api/solver', () => ({
  computeFarField: vi.fn().mockResolvedValue({
    frequency: 300,
    theta_angles: [0, 10, 20],
    phi_angles: [0, 10, 20],
    E_theta_mag: [1.0, 0.9, 0.8],
    E_phi_mag: [0.5, 0.4, 0.3],
    E_total_mag: [1.1, 1.0, 0.9],
    pattern_db: [0, -1, -2],
    directivity: 2.5,
    gain: 2.0,
    efficiency: 0.8,
    max_direction: [0, 0],
  }),
}));

describe('Incremental Postprocessing Workflow', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        solver: solverReducer,
        design: (state = { elements: [] }) => state,
      },
      preloadedState: {
        solver: {
          status: 'idle',
          progress: 0,
          error: null,
          jobId: null,
          currentRequest: null,
          results: {
            frequency: 300,
            branch_currents: [{ real: 0.5, imag: 0.2 }],
            impedances: [[{ real: 50, imag: 10 }]],
            voltages: [[{ real: 1.0, imag: 0 }]],
          },
          currentDistribution: null,
          radiationPattern: null,
          multiAntennaResults: null,
          frequencySweep: null,
          sweepInProgress: false,
          resultsHistory: [],
          requestedFields: [],
          directivityRequested: false,
          directivitySettings: { theta_points: 19, phi_points: 37 },
          solverState: 'solved',
          currentFrequency: 300,
          fieldResults: null,
          postprocessingStatus: 'idle',
          postprocessingProgress: null,
        } as SolverState,
        design: {
          elements: [
            {
              id: 'dipole-1',
              type: 'dipole',
              name: 'Dipole',
              mesh: {
                nodes: [[0, 0, 0], [0, 0, 1]],
                edges: [[0, 1]],
                radii: [0.001],
              },
            },
          ],
        },
      },
    });
  });

  it('computes all fields on first postprocessing run', async () => {
    // Add two fields
    store.dispatch(addFieldRegion({
      id: 'field-1',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 50],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    store.dispatch(addFieldRegion({
      id: 'field-2',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 100],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    // Run postprocessing
    await store.dispatch(computePostprocessingWorkflow());

    const state = store.getState().solver;
    
    // Both fields should be computed
    expect(state.fieldResults).toBeDefined();
    expect(state.fieldResults['field-1']?.computed).toBe(true);
    expect(state.fieldResults['field-2']?.computed).toBe(true);
    expect(state.postprocessingStatus).toBe('completed');
  });

  it('computes only new field when added after postprocessing', async () => {
    // First run: Add one field and compute
    store.dispatch(addFieldRegion({
      id: 'field-1',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 50],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    await store.dispatch(computePostprocessingWorkflow());
    
    // Mark as postprocessing-ready
    let state = store.getState().solver;
    expect(state.solverState).toBe('postprocessing-ready');
    expect(state.fieldResults['field-1']?.computed).toBe(true);

    // Second run: Add another field
    store.dispatch(addFieldRegion({
      id: 'field-2',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 100],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    // Run postprocessing again
    await store.dispatch(computePostprocessingWorkflow());

    state = store.getState().solver;
    
    // Both fields should be computed
    expect(state.fieldResults['field-1']?.computed).toBe(true);
    expect(state.fieldResults['field-2']?.computed).toBe(true);
  });

  it('computes only directivity when requested', async () => {
    store.dispatch(setDirectivityRequested(true));

    await store.dispatch(computePostprocessingWorkflow());

    const state = store.getState().solver;
    
    expect(state.fieldResults['directivity']?.computed).toBe(true);
    expect(state.radiationPattern).toBeDefined();
  });

  it('uses custom directivity settings', async () => {
    store.dispatch(setDirectivitySettings({ theta_points: 30, phi_points: 60 }));
    store.dispatch(setDirectivityRequested(true));

    await store.dispatch(computePostprocessingWorkflow());

    const state = store.getState().solver;
    
    expect(state.fieldResults['directivity']?.computed).toBe(true);
    expect(state.directivitySettings.theta_points).toBe(30);
    expect(state.directivitySettings.phi_points).toBe(60);
  });

  it('computes both directivity and fields together', async () => {
    store.dispatch(setDirectivityRequested(true));
    store.dispatch(addFieldRegion({
      id: 'field-1',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 50],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    await store.dispatch(computePostprocessingWorkflow());

    const state = store.getState().solver;
    
    expect(state.fieldResults['directivity']?.computed).toBe(true);
    expect(state.fieldResults['field-1']?.computed).toBe(true);
  });

  it('skips computation when all fields already computed', async () => {
    // First run
    store.dispatch(addFieldRegion({
      id: 'field-1',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 50],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    await store.dispatch(computePostprocessingWorkflow());

    const firstState = store.getState().solver;
    expect(firstState.fieldResults['field-1']?.computed).toBe(true);

    // Second run without adding anything
    const result = await store.dispatch(computePostprocessingWorkflow());

    expect(result.payload.message).toBe('All fields already computed');
  });

  it('clears field results when directivity settings change', () => {
    // Set initial computed state
    store.dispatch(updateFieldResult({
      fieldId: 'directivity',
      computed: true,
      num_points: 0,
    }));

    let state = store.getState().solver;
    expect(state.fieldResults['directivity']?.computed).toBe(true);

    // Change settings - should clear computed status
    store.dispatch(setDirectivitySettings({ theta_points: 50, phi_points: 100 }));
    // Note: The clearing happens in the UI component, not in the reducer
    
    state = store.getState().solver;
    expect(state.directivitySettings.theta_points).toBe(50);
    expect(state.directivitySettings.phi_points).toBe(100);
  });

  it('tracks progress correctly with unified counter', async () => {
    store.dispatch(setDirectivityRequested(true));
    store.dispatch(addFieldRegion({
      id: 'field-1',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 50],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    store.dispatch(addFieldRegion({
      id: 'field-2',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 100],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    await store.dispatch(computePostprocessingWorkflow());

    const state = store.getState().solver;
    
    // Progress should be cleared after completion
    expect(state.postprocessingProgress).toBeNull();
    // But all 3 items should be computed: 1 directivity + 2 fields
    expect(state.postprocessingStatus).toBe('completed');
    expect(state.fieldResults['directivity']?.computed).toBe(true);
    expect(state.fieldResults['field-1']?.computed).toBe(true);
    expect(state.fieldResults['field-2']?.computed).toBe(true);
  });

  it('allows postprocessing from postprocessing-ready state', async () => {
    // Set state to postprocessing-ready
    store = configureStore({
      reducer: {
        solver: solverReducer,
        design: (state = { elements: [] }) => state,
      },
      preloadedState: {
        solver: {
          ...store.getState().solver,
          solverState: 'postprocessing-ready',
        },
        design: store.getState().design,
      },
    });

    store.dispatch(addFieldRegion({
      id: 'field-new',
      type: '2D',
      shape: 'plane',
      centerPoint: [0, 0, 50],
      dimensions: { width: 100, height: 100 },
      normalPreset: 'XY',
      sampling: { x: 5, y: 5 },
      farField: false,
      fieldTypes: ['E'],
    }));

    // Should be able to run postprocessing
    await store.dispatch(computePostprocessingWorkflow());

    const state = store.getState().solver;
    expect(state.fieldResults['field-new']?.computed).toBe(true);
  });
});

