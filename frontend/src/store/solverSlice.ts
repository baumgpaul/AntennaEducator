/**
 * Solver Redux Slice
 * Manages simulation execution, progress tracking, and results
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { SolverRequest, SolverResult } from '@/types/models';
import type { AntennaSolution, MultiAntennaRequest, MultiAntennaSolutionResponse, FrequencySweepParams, FrequencySweepResult } from '@/types/api';
import type { ParameterStudyConfig, ParameterStudyResult, MeshSnapshot } from '@/types/parameterStudy';
import { runParameterStudy } from '@/store/parameterStudyThunks';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import { solveMultiAntenna } from '@/api/solver';
import { computeFarField, computeNearField } from '@/api/postprocessor';
import { generateObservationPoints } from '@/utils/fieldGeneration';
import { convertElementToAntennaInput } from '@/utils/multiAntennaBuilder';
import { getCurrentUserAsync } from '@/store/authSlice';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check whether an element has voltage sources between two real mesh nodes
 * (both node_start >= 1 and node_end >= 1).  Ground-referencing sources
 * (node 0) cannot be represented as far-field edges because the ground
 * node has no physical mesh position.  Additionally, balanced-feed
 * dipoles have 2 ground-referencing sources that the solver merges into
 * 1 gap source, which would cause an edges/currents count mismatch.
 */
function hasNonGroundVs(el: { sources?: { type?: string; node_start?: number | null; node_end?: number | null }[] }): boolean {
  if (!el.sources || el.sources.length === 0) return false;
  return el.sources.some(
    s => s.type === 'voltage'
      && s.node_start != null && s.node_end != null
      && s.node_start >= 1 && s.node_end >= 1
  );
}

/** True when the element has a two-terminal current source (both nodes >= 1). */
function hasNonGroundCs(el: { sources?: { type?: string; node_start?: number | null; node_end?: number | null }[] }): boolean {
  if (!el.sources || el.sources.length === 0) return false;
  return el.sources.some(
    s => s.type === 'current'
      && s.node_start != null && s.node_end != null
      && s.node_start >= 1 && s.node_end >= 1
  );
}

/**
 * Extract a user-friendly error message from Axios errors.
 * Handles both string detail and structured detail objects (e.g. 402 token errors).
 */
function extractErrorMessage(error: any, fallback: string): string {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && detail.message) {
    if (detail.required !== undefined && detail.balance !== undefined) {
      return `${detail.message} (need ${detail.required}, have ${detail.balance})`;
    }
    return detail.message;
  }
  return error.message || fallback;
}

/**
 * Parse complex number from various formats:
 * - String: "a+bj" or "a-bj" (Python format)
 * - Object: {real: a, imag: b}
 * - Array: [a, b]
 * - Number: a (imag = 0)
 */
function parseComplex(val: any): { real: number; imag: number } {
  if (typeof val === 'string') {
    // Python format: "a+bj" or "a-bj"
    const match = val.match(/^([+-]?[\d.e+-]+)([+-][\d.e+-]+)j$/);
    if (match) {
      return { real: parseFloat(match[1]), imag: parseFloat(match[2]) };
    }
    return { real: 0, imag: 0 };
  }
  if (typeof val === 'object' && val !== null && 'real' in val && 'imag' in val) {
    return { real: val.real, imag: val.imag };
  }
  if (Array.isArray(val) && val.length >= 2) {
    return { real: val[0], imag: val[1] };
  }
  if (typeof val === 'number') {
    return { real: val, imag: 0 };
  }
  return { real: 0, imag: 0 };
}

/**
 * Parse array of complex numbers
 */
function parseComplexArray(arr: any[]): Array<{ real: number; imag: number }> {
  return arr.map(parseComplex);
}

/**
 * Calculate total size of field data in memory (MB)
 * Used to warn users about large datasets
 */
function calculateFieldDataSize(fieldData: SolverState['fieldData']): number {
  if (!fieldData) return 0;

  let totalBytes = 0;

  for (const fieldId in fieldData) {
    for (const freqHz in fieldData[fieldId]) {
      const data = fieldData[fieldId][freqHz];

      // Points: 3 numbers × 8 bytes each
      totalBytes += (data.points?.length || 0) * 3 * 8;

      // Magnitudes: 1 number × 8 bytes each
      totalBytes += (data.E_mag?.length || 0) * 8;
      totalBytes += (data.H_mag?.length || 0) * 8;

      // Complex vectors: 3 components × 2 values (real/imag) × 8 bytes each
      totalBytes += (data.E_vectors?.length || 0) * 3 * 2 * 8;
      totalBytes += (data.H_vectors?.length || 0) * 3 * 2 * 8;
    }
  }

  return totalBytes / (1024 * 1024); // Convert to MB
}

/**
 * Build a combined mesh from MeshSnapshot[] (for sweep-mode postprocessing).
 * Handles VS/CS edge insertion identical to the element-loop logic.
 *
 * @param snapshots - Per-element mesh snapshots for one sweep point
 * @param includeVsEdges - Whether to include voltage source gap edges
 * @param applyPosition - Whether to offset nodes by snapshot.position (far-field)
 */
function buildCombinedMeshFromSnapshots(
  snapshots: MeshSnapshot[],
  includeVsEdges: boolean,
  applyPosition: boolean,
): {
  nodes: number[][];
  edges: [number, number][];
  radii: number[];
  csEdgeSnapshots: { snapshot: MeshSnapshot; nodeOffset: number }[];
} {
  let combinedNodes: number[][] = [];
  let combinedEdges: [number, number][] = [];
  let combinedRadii: number[] = [];
  let nodeOffset = 0;
  const csEdgeSnapshots: { snapshot: MeshSnapshot; nodeOffset: number }[] = [];

  for (const snapshot of snapshots) {
    const pos = applyPosition && snapshot.position ? snapshot.position : [0, 0, 0];
    const offsetNodes = snapshot.nodes.map(node => [
      node[0] + pos[0],
      node[1] + pos[1],
      node[2] + pos[2],
    ]);
    combinedNodes = combinedNodes.concat(offsetNodes);

    const offsetEdges = snapshot.edges.map(
      ([a, b]) => [a + nodeOffset, b + nodeOffset] as [number, number],
    );
    combinedEdges = combinedEdges.concat(offsetEdges);

    if (snapshot.radii && snapshot.radii.length > 0) {
      combinedRadii = combinedRadii.concat(snapshot.radii);
    } else {
      combinedRadii = combinedRadii.concat(snapshot.edges.map(() => 0.001));
    }

    // VS edges: include non-ground voltage source gap edges
    if (includeVsEdges && hasNonGroundVs(snapshot) && snapshot.sources) {
      for (const source of snapshot.sources) {
        if (source.type === 'voltage'
            && source.node_start != null && source.node_end != null
            && source.node_start >= 1 && source.node_end >= 1) {
          combinedEdges.push([source.node_start + nodeOffset, source.node_end + nodeOffset]);
          combinedRadii.push((snapshot.radii && snapshot.radii[0]) ?? 0.001);
        }
      }
    }

    // Track elements with non-ground CS for gap edges
    if (hasNonGroundCs(snapshot)) {
      csEdgeSnapshots.push({ snapshot, nodeOffset });
    }

    nodeOffset += snapshot.nodes.length;
  }

  // Add CS gap edges: [node_end → node_start] so positive current completes loop
  for (const { snapshot, nodeOffset: off } of csEdgeSnapshots) {
    for (const source of snapshot.sources ?? []) {
      if (source.type === 'current'
          && source.node_start != null && source.node_end != null
          && source.node_start >= 1 && source.node_end >= 1) {
        combinedEdges.push([source.node_end + off, source.node_start + off]);
        combinedRadii.push((snapshot.radii && snapshot.radii[0]) ?? 0.001);
      }
    }
  }

  return { nodes: combinedNodes, edges: combinedEdges, radii: combinedRadii, csEdgeSnapshots };
}

// ============================================================================
// Types
// ============================================================================

export type SimulationStatus = 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SolverWorkflowState = 'idle' | 'solved' | 'postprocessing-ready';
export type SolveMode = 'single' | 'sweep' | null;

export interface RadiationPatternData {
  frequency: number;
  theta_angles: number[];
  phi_angles: number[];
  E_theta_mag: number[];
  E_phi_mag: number[];
  E_total_mag: number[];
  pattern_db: number[];
  directivity: number;
  gain: number;
  efficiency: number;
  beamwidth_theta?: number;
  beamwidth_phi?: number;
  max_direction: [number, number];
}

interface SolverState {
  // Solve mode: 'single' | 'sweep' | null (nothing solved yet)
  solveMode: SolveMode;

  // Current simulation
  status: SimulationStatus;
  progress: number; // 0-100
  error: string | null;

  // Current simulation parameters
  currentRequest: SolverRequest | null;

  // Results
  results: SolverResult | null;
  currentDistribution: number[] | null; // Magnitude of branch currents for visualization
  radiationPattern: RadiationPatternData | null;

  // Multi-antenna results
  multiAntennaResults: MultiAntennaSolutionResponse | null;

  // Frequency sweep results
  frequencySweep: FrequencySweepResult | null;
  sweepInProgress: boolean;
  sweepProgress: { current: number; total: number } | null;

  // History
  resultsHistory: Array<{
    timestamp: string;
    frequency: number;
    result: SolverResult;
  }>;

  // Field definitions and postprocessing
  requestedFields: FieldDefinition[];
  directivityRequested: boolean;
  directivitySettings: { theta_points: number; phi_points: number };
  solverState: SolverWorkflowState;
  currentFrequency: number | null; // MHz - set after single frequency solve
  fieldResults: Record<string, { computed: boolean; num_points: number }> | null; // Track which fields have been computed
  postprocessingStatus: 'idle' | 'running' | 'completed' | 'failed'; // Separate status for postprocessing
  postprocessingProgress: { completed: number; total: number } | null; // Track field computation progress

  // Field data storage (in-memory for fast frequency switching)
  fieldData: Record<string, Record<number, {
    points: Array<[number, number, number]>; // Observation points [x, y, z] in meters
    E_mag?: number[]; // E-field magnitudes at each point
    H_mag?: number[]; // H-field magnitudes at each point
    E_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>; // Complex E-field vectors
    H_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>; // Complex H-field vectors
  }>> | null; // fieldData[fieldId][frequencyHz] = { points, magnitudes, vectors }

  // Per-frequency radiation patterns (for sweep mode)
  radiationPatterns: Record<number, RadiationPatternData> | null; // radiationPatterns[frequencyHz]

  // Global selected frequency (Hz) for postprocessing display
  selectedFrequencyHz: number | null;

  // Results validity tracking
  resultsStale: boolean; // True when geometry/sources changed and results are outdated

  // Parameter study
  parameterStudy: ParameterStudyResult | null;
  parameterStudyConfig: ParameterStudyConfig | null;

  // Selected sweep point index (for postprocessing slider navigation)
  selectedSweepPointIndex: number;

  // Port quantity results (per antenna_id)
  portResults: Record<string, import('@/api/postprocessor').PortQuantitiesResponseOutput> | null;
}

const initialState: SolverState = {
  solveMode: null,
  status: 'idle',
  progress: 0,
  error: null,
  currentRequest: null,
  results: null,
  currentDistribution: null,
  radiationPattern: null,
  multiAntennaResults: null,
  frequencySweep: null,
  sweepInProgress: false,
  sweepProgress: null,
  resultsHistory: [],
  requestedFields: [],
  directivityRequested: false,
  directivitySettings: { theta_points: 19, phi_points: 37 },
  solverState: 'idle',
  currentFrequency: null,
  fieldResults: null,
  postprocessingStatus: 'idle',
  postprocessingProgress: null,
  fieldData: null,
  radiationPatterns: null,
  selectedFrequencyHz: null,
  resultsStale: false,
  parameterStudy: null,
  parameterStudyConfig: null,
  selectedSweepPointIndex: 0,
  portResults: null,
};

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Run multi-antenna simulation
 * This is the preferred method for all simulations (single or multiple elements)
 */
export const runMultiAntennaSimulation = createAsyncThunk<
  MultiAntennaSolutionResponse,
  MultiAntennaRequest,
  { state: RootState }
>('solver/runMultiAntennaSimulation', async (request, { rejectWithValue }) => {
  try {
    const result = await solveMultiAntenna(request);
    return result;
  } catch (error: any) {
    const errorMessage = extractErrorMessage(error, 'Multi-antenna simulation failed');
    return rejectWithValue(errorMessage);
  }
});

/**
 * Run frequency sweep simulation
 * Executes solver at multiple frequencies and stores results
 */
export const runFrequencySweep = createAsyncThunk<
  FrequencySweepResult,
  {
    params: FrequencySweepParams;
    request: MultiAntennaRequest; // Base request with mesh, sources, etc.
  },
  { state: RootState }
>('solver/runFrequencySweep', async ({ params, request }, { dispatch, rejectWithValue }) => {
  try {
    const { startFrequency, stopFrequency, numPoints, spacing } = params;

    // Generate frequency array
    const frequencies: number[] = [];
    if (spacing === 'linear') {
      const step = (stopFrequency - startFrequency) / (numPoints - 1);
      for (let i = 0; i < numPoints; i++) {
        frequencies.push(startFrequency + i * step);
      }
    } else {
      // Logarithmic spacing
      const logStart = Math.log10(startFrequency);
      const logStop = Math.log10(stopFrequency);
      const logStep = (logStop - logStart) / (numPoints - 1);
      for (let i = 0; i < numPoints; i++) {
        frequencies.push(Math.pow(10, logStart + i * logStep));
      }
    }

    // Run simulations for each frequency
    const results: MultiAntennaSolutionResponse[] = [];
    const currentDistributions: Array<{
      frequency: number;
      currents: number[][];
    }> = [];

    for (let i = 0; i < frequencies.length; i++) {
      const frequency = frequencies[i];

      // Update progress
      dispatch(setProgress(Math.round((i / frequencies.length) * 100)));
      dispatch(setSweepProgress({ current: i + 1, total: frequencies.length }));

      // Create request for this frequency
      const freqRequest: MultiAntennaRequest = {
        ...request,
        frequency,
      };

      // Call solver
      const result = await solveMultiAntenna(freqRequest);
      results.push(result);

      // Extract current magnitudes per antenna
      const antennaCurrents: number[][] = result.antenna_solutions.map((solution) => {
        return parseComplexArray(solution.branch_currents).map((current) => {
          const real = current.real || 0;
          const imag = current.imag || 0;
          return Math.sqrt(real * real + imag * imag);
        });
      });

      currentDistributions.push({
        frequency,
        currents: antennaCurrents,
      });
    }

    // Reset progress
    dispatch(setProgress(100));

    const sweepResult: FrequencySweepResult = {
      frequencies,
      results,
      completedCount: results.length,
      totalCount: numPoints,
      isComplete: true,
      currentDistributions,
    };

    // Refresh token balance after sweep
    dispatch(getCurrentUserAsync());

    return sweepResult;
  } catch (error: any) {
    return rejectWithValue(extractErrorMessage(error, 'Frequency sweep failed'));
  }
});

/**
 * Solve current design at a single frequency (workflow entry point from Solver tab)
 * This is the main entry point for the "Solve Single Frequency" button
 */
export const solveSingleFrequencyWorkflow = createAsyncThunk<
  SolverResult,
  { frequency: number; unit: 'MHz' | 'GHz' },
  { state: RootState }
>('solver/solveSingleFrequencyWorkflow', async ({ frequency, unit }, { getState, rejectWithValue, dispatch }) => {
  try {
    const state = getState();
    const { elements } = state.design;

    if (!elements || elements.length === 0) {
      return rejectWithValue('No antenna elements in design');
    }

    // Convert frequency to MHz
    const frequencyMHz = unit === 'GHz' ? frequency * 1000 : frequency;

    // Prepare multi-antenna request using canonical builder
    const antennaRequests = elements
      .filter((el) => el.visible && !el.locked && el.mesh && el.mesh.nodes.length > 0 && el.mesh.edges.length > 0)
      .map((element) => convertElementToAntennaInput(element));

    if (antennaRequests.length === 0) {
      return rejectWithValue('No valid elements for simulation');
    }

    const request: MultiAntennaRequest = {
      frequency: frequencyMHz * 1e6, // Convert MHz to Hz
      antennas: antennaRequests,
    };

    // Call multi-antenna solver (handles single antenna too)
    const result = await dispatch(runMultiAntennaSimulation(request)).unwrap();

    // Update workflow state
    dispatch(setSolverState('solved'));
    dispatch(setSolveMode('single'));
    dispatch(setCurrentFrequency(frequencyMHz));

    // Refresh token balance after simulation
    dispatch(getCurrentUserAsync());

    // Return first solution for compatibility
    if (result.antenna_solutions.length > 0) {
      const solution = result.antenna_solutions[0];
      const inputImpedance = parseComplex(solution.input_impedance);

      return {
        project_id: 'default', // Placeholder until projects system implemented
        frequency: result.frequency,
        omega: result.frequency * 2 * Math.PI,
        converged: result.converged,
        branch_currents: parseComplexArray(solution.branch_currents),
        node_voltages: parseComplexArray(solution.node_voltages),
        appended_voltages: parseComplexArray(solution.appended_voltages),
        input_impedance: inputImpedance,
        input_current: { real: 0, imag: 0 },
        reflection_coefficient: { real: 0, imag: 0 },
        return_loss: 0,
        input_power: 0,
        reflected_power: 0,
        accepted_power: 0,
        power_dissipated: 0,
        solve_time: result.solve_time,
      } as SolverResult;
    }

    throw new Error('No antenna solutions returned');
  } catch (error: any) {
    return rejectWithValue(extractErrorMessage(error, 'Solve failed'));
  }
});

/**
 * Compute postprocessing for requested fields and directivity
 * This is called when user clicks "Compute Postprocessing" button
 */
export const computePostprocessingWorkflow = createAsyncThunk<
  {
    directivity?: any; // Will be computed if directivityRequested
    fields?: Array<{ fieldId: string; computed: boolean; dataUrl?: string }>; // Field computation results
    message: string;
  },
  void,
  { state: RootState }
>('solver/computePostprocessingWorkflow', async (_, { getState, rejectWithValue, dispatch }) => {
  try {
    const state = getState();
    const { results, directivityRequested, frequencySweep, currentFrequency, solveMode, parameterStudy: paramStudy } = state.solver;
    // Cast needed: Immer's WritableNonArrayDraft mangles Zod-inferred tuple types
    const requestedFields = state.solver.requestedFields as FieldDefinition[];
    const { elements } = state.design;

    // Debug logging for branch currents issue
    console.log('[Postprocessing] State check:', {
      hasResults: !!results,
      hasBranchCurrents: results ? !!results.branch_currents : false,
      branchCurrentsLength: results?.branch_currents?.length,
      frequencySweepResults: frequencySweep?.results?.length,
      currentFrequency,
      solveMode,
      parameterStudyPoints: paramStudy?.results?.length,
    });

    // Check for either single solve results or sweep results
    const isSweep = solveMode === 'sweep' && paramStudy != null && paramStudy.results.length > 0;
    const isSweepMode = isSweep || (frequencySweep && frequencySweep.frequencies && frequencySweep.frequencies.length > 1);
    const hasResults = results || isSweep || (isSweepMode && frequencySweep?.results && frequencySweep.results.length > 0);

    if (!hasResults) {
      return rejectWithValue('No solver results available. Run solver first.');
    }

    if (!elements || elements.length === 0) {
      return rejectWithValue('No antenna elements in design');
    }

    // Determine frequencies and get a reference result for mesh data
    const frequencies = isSweepMode ? frequencySweep!.frequencies : (currentFrequency ? [currentFrequency * 1e6] : [results!.frequency]);
    const referenceResult = isSweepMode && frequencySweep?.results?.length ? frequencySweep.results[0] : results!;

    if (!referenceResult) {
      return rejectWithValue('No reference result available for postprocessing');
    }

    const response: {
      directivity?: RadiationPatternData;
      fields?: Array<{ fieldId: string; computed: boolean; dataUrl?: string }>;
      message: string;
    } = { message: 'Postprocessing complete' };

    // Check what needs computing (incremental computation)
    const existingFieldResults = getState().solver.fieldResults || {};
    const fieldsToCompute = requestedFields.filter(field => !existingFieldResults[field.id]?.computed);
    const directivityNeedsComputing = directivityRequested && !existingFieldResults['directivity']?.computed;

    if (fieldsToCompute.length === 0 && !directivityNeedsComputing) {
      return {
        message: 'All fields already computed',
        fields: Object.entries(existingFieldResults).map(([fieldId, result]) => ({
          fieldId,
          computed: result.computed,
          num_points: result.num_points,
          E_magnitudes: [],
          H_magnitudes: [],
        })),
      };
    }

    // ====================================================================
    // SWEEP MODE: iterate all parameter study sweep points
    // ====================================================================
    if (isSweep) {
      const studyResults = paramStudy!.results;
      const numPoints = studyResults.length;
      const { directivitySettings } = state.solver;

      const totalWork = (fieldsToCompute.length * numPoints)
        + (directivityNeedsComputing ? numPoints : 0);
      let completedWork = 0;
      dispatch(updatePostprocessingProgress({ completed: 0, total: totalWork }));

      // --- Directivity for each sweep point ---
      if (directivityNeedsComputing) {
        for (let ptIdx = 0; ptIdx < numPoints; ptIdx++) {
          const ptResult = studyResults[ptIdx];
          const snapshots = ptResult.meshSnapshots;
          const resp = ptResult.solverResponse as MultiAntennaSolutionResponse;
          const freqHz = resp.frequency;

          if (!snapshots || snapshots.length === 0) {
            completedWork++;
            dispatch(updatePostprocessingProgress({ completed: completedWork, total: totalWork }));
            continue;
          }

          // Build far-field mesh (with position offset)
          const ffMesh = buildCombinedMeshFromSnapshots(snapshots, true, true);

          // Branch currents from solver response + VS currents
          const branchCurrents: any[] = resp.antenna_solutions.flatMap((sol, i) => [
            ...(sol.branch_currents || []),
            ...(hasNonGroundVs(snapshots[i]) ? (sol.voltage_source_currents || []) : []),
          ]);

          // Append CS currents for gap edges
          for (const { snapshot } of ffMesh.csEdgeSnapshots) {
            for (const source of snapshot.sources ?? []) {
              if (source.type === 'current'
                  && source.node_start != null && source.node_end != null
                  && source.node_start >= 1 && source.node_end >= 1) {
                branchCurrents.push(source.amplitude ?? 1.0);
              }
            }
          }

          const pattern = await computeFarField({
            frequencies: [freqHz],
            branch_currents: [branchCurrents],
            nodes: ffMesh.nodes,
            edges: ffMesh.edges,
            radii: ffMesh.radii,
            theta_points: directivitySettings.theta_points,
            phi_points: directivitySettings.phi_points,
          });

          // Key radiation patterns by sweep point index
          dispatch(setRadiationPatternForFrequency({ frequencyHz: ptIdx, pattern }));

          completedWork++;
          dispatch(updatePostprocessingProgress({ completed: completedWork, total: totalWork }));
        }

        const firstPattern = getState().solver.radiationPatterns?.[0];
        if (firstPattern) {
          response.directivity = firstPattern;
        }
        dispatch(updateFieldResult({ fieldId: 'directivity', computed: true, num_points: 0 }));
      }

      // --- Near-field computation for each sweep point ---
      if (fieldsToCompute.length > 0) {
        const fieldResultsList: Array<{ fieldId: string; computed: boolean; num_points: number }> = [];

        for (const field of fieldsToCompute) {
          const observation_points = generateObservationPoints(field);

          for (let ptIdx = 0; ptIdx < numPoints; ptIdx++) {
            const ptResult = studyResults[ptIdx];
            const snapshots = ptResult.meshSnapshots;
            const resp = ptResult.solverResponse as MultiAntennaSolutionResponse;
            const freqHz = resp.frequency;

            if (!snapshots || snapshots.length === 0) {
              completedWork++;
              dispatch(updatePostprocessingProgress({ completed: completedWork, total: totalWork }));
              continue;
            }

            // Build near-field mesh (no position offset)
            const nfMesh = buildCombinedMeshFromSnapshots(snapshots, true, false);

            // Branch currents from solver response + VS currents
            const nfVsPerSnapshot = snapshots.map(s => hasNonGroundVs(s));
            const branchCurrents: any[] = resp.antenna_solutions?.length
              ? resp.antenna_solutions.flatMap((sol, i) => [
                  ...(sol.branch_currents || []),
                  ...(nfVsPerSnapshot[i] ? (sol.voltage_source_currents || []) : []),
                ])
              : [];

            // Append CS currents for gap edges
            for (const { snapshot } of nfMesh.csEdgeSnapshots) {
              for (const source of snapshot.sources ?? []) {
                if (source.type === 'current'
                    && source.node_start != null && source.node_end != null
                    && source.node_start >= 1 && source.node_end >= 1) {
                  branchCurrents.push(source.amplitude ?? 1.0);
                }
              }
            }

            const fieldRequest = {
              frequencies: [freqHz],
              branch_currents: [branchCurrents],
              nodes: nfMesh.nodes,
              edges: nfMesh.edges,
              radii: nfMesh.radii,
              observation_points,
            };

            const fieldDataResult = await computeNearField(fieldRequest);

            // Key field data by sweep point index (not frequency Hz)
            dispatch(setFieldData({
              fieldId: field.id,
              frequencyHz: ptIdx,
              data: {
                points: fieldRequest.observation_points as Array<[number, number, number]>,
                E_mag: fieldDataResult.E_magnitudes,
                H_mag: fieldDataResult.H_magnitudes,
                E_vectors: fieldDataResult.E_field,
                H_vectors: fieldDataResult.H_field,
              },
            }));

            completedWork++;
            dispatch(updatePostprocessingProgress({ completed: completedWork, total: totalWork }));
          }

          dispatch(updateFieldResult({
            fieldId: field.id,
            computed: true,
            num_points: observation_points.length,
          }));

          fieldResultsList.push({
            fieldId: field.id,
            computed: true,
            num_points: observation_points.length,
          });
        }

        response.fields = fieldResultsList;
      }

      // Shared cleanup for sweep mode
      const totalFieldDataSizeMB = calculateFieldDataSize(getState().solver.fieldData);
      if (totalFieldDataSizeMB > 50) {
        console.warn(`⚠️ Large field dataset: ${totalFieldDataSizeMB.toFixed(1)} MB stored in memory`);
      }

      const portElements = elements.filter(
        (el) => el.ports && el.ports.length > 0 && el.visible && !el.locked,
      );
      if (portElements.length > 0) {
        try {
          await dispatch(requestPortQuantities()).unwrap();
        } catch (portErr) {
          console.warn('[Postprocessing] Port quantities failed:', portErr);
        }
      }

      dispatch(setSolverState('postprocessing-ready'));
      dispatch(getCurrentUserAsync());

      return { ...response, message: `Sweep postprocessing complete (${numPoints} points)`, totalFieldDataSizeMB };
    }

    // ====================================================================
    // SINGLE / LEGACY FREQ SWEEP MODE (existing code below, unchanged)
    // ====================================================================

    // Initialize progress tracking for all work to be done
    // For sweep mode, each field × each frequency is one work unit; directivity counts per frequency too
    const numFreqs = frequencies.length;
    const totalWork = (fieldsToCompute.length * numFreqs)
      + (directivityNeedsComputing ? numFreqs : 0);
    let completedWork = 0;
    dispatch(updatePostprocessingProgress({ completed: 0, total: totalWork }));

    // Compute directivity if requested — one API call per frequency
    if (directivityNeedsComputing) {
      for (let freqIdx = 0; freqIdx < frequencies.length; freqIdx++) {
        const freqHz = frequencies[freqIdx];
        const pattern = await dispatch(computeRadiationPatternForFrequency({
          frequencyIndex: freqIdx,
        })).unwrap();

        // Store per-frequency radiation pattern
        dispatch(setRadiationPatternForFrequency({ frequencyHz: freqHz, pattern }));

        completedWork++;
        dispatch(updatePostprocessingProgress({ completed: completedWork, total: totalWork }));
      }

      // Set the first frequency's pattern as the active one for backward compat
      const firstFreqHz = frequencies[0];
      const firstPattern = getState().solver.radiationPatterns?.[firstFreqHz];
      if (firstPattern) {
        response.directivity = firstPattern;
      }

      dispatch(updateFieldResult({
        fieldId: 'directivity',
        computed: true,
        num_points: 0,
      }));
    }

    // Compute requested field regions
    if (fieldsToCompute.length > 0) {
      // Get mesh data - combine from all elements for multi-antenna
      const elementsWithMesh = elements.filter(e => e.mesh);
      if (elementsWithMesh.length === 0) {
        return rejectWithValue('No mesh data available for field computation');
      }

      // Combine mesh data from all elements
      let combinedNodes: number[][] = [];
      let combinedEdges: [number, number][] = [];
      let combinedRadii: number[] = [];
      let nodeOffset = 0;

      // Only add VS edges to the mesh when VS currents will also be included in
      // branch_currents_for_freq — otherwise the edge/current counts diverge and
      // the backend einsum raises a shape error (500).
      const includeVsEdgesNF = isSweepMode
        ? !!(frequencySweep?.results?.some(r => r.antenna_solutions?.length))
        : !!(state.solver.multiAntennaResults?.antenna_solutions?.length);

      // Track two-terminal CS edges to add after the mesh loop.
      const csEdgeElements: { element: typeof elementsWithMesh[0]; nodeOffset: number }[] = [];

      for (const element of elementsWithMesh) {
        const mesh = element.mesh!;

        // Add nodes
        combinedNodes = combinedNodes.concat(mesh.nodes);

        // Add edges with node index offset
        const offsetEdges = mesh.edges.map(([a, b]: [number, number]) => [a + nodeOffset, b + nodeOffset] as [number, number]);
        combinedEdges = combinedEdges.concat(offsetEdges);

        // Add radii or defaults
        if (mesh.radii && mesh.radii.length > 0) {
          combinedRadii = combinedRadii.concat(mesh.radii);
        } else {
          combinedRadii = combinedRadii.concat(mesh.edges.map(() => 0.001)); // Default 1mm
        }

        // Include voltage source edges so fields see a closed current path.
        // Only for non-ground VS to keep edge count == branch_current count.
        if (includeVsEdgesNF && hasNonGroundVs(element) && element.sources) {
          for (const source of element.sources) {
            if (source.type === 'voltage'
                && source.node_start != null && source.node_end != null
                && source.node_start >= 1 && source.node_end >= 1) {
              combinedEdges.push([source.node_start + nodeOffset, source.node_end + nodeOffset] as [number, number]);
              combinedRadii.push((mesh.radii && mesh.radii[0]) ?? 0.001);
            }
          }
        }

        // Include two-terminal CS edges (gap edge removed during meshing).
        // The CS current value is appended to branch_currents later per-frequency.
        if (hasNonGroundCs(element)) {
          csEdgeElements.push({ element, nodeOffset });
        }

        nodeOffset += mesh.nodes.length;
      }

      // Add two-terminal CS gap edges to the mesh.
      // Edge direction [node_end → node_start] so positive current completes loop.
      for (const { element, nodeOffset: off } of csEdgeElements) {
        for (const source of element.sources ?? []) {
          if (source.type === 'current'
              && source.node_start != null && source.node_end != null
              && source.node_start >= 1 && source.node_end >= 1) {
            combinedEdges.push([source.node_end + off, source.node_start + off] as [number, number]);
            combinedRadii.push((element.mesh!.radii && element.mesh!.radii[0]) ?? 0.001);
          }
        }
      }

      const mesh = {
        nodes: combinedNodes,
        edges: combinedEdges,
        radii: combinedRadii,
      };

      console.log('[Postprocessing] Combined mesh:', {
        elementsCount: elementsWithMesh.length,
        totalNodes: mesh.nodes.length,
        totalEdges: mesh.edges.length,
      });

      // Compute fields for each requested region, one frequency at a time
      const fieldResults = [];

      for (const field of fieldsToCompute) {
        // Generate observation points based on field definition
        const observation_points = generateObservationPoints(field);

        // Validate mesh data (radii already combined above)
        if (!mesh.radii || mesh.radii.length === 0) {
          return rejectWithValue('Unable to determine edge radii for field computation');
        }

        // Iterate over each frequency individually so the backend returns
        // correct field data for that frequency (avoids the Lambda 6MB limit
        // and the "returns only first frequency" issue).
        for (let freqIdx = 0; freqIdx < frequencies.length; freqIdx++) {
          const freqHz = frequencies[freqIdx];

          // Extract branch currents for this frequency
          let branch_currents_for_freq: AntennaSolution['branch_currents'];
          const multiAntennaResultsForField = state.solver.multiAntennaResults;

          // Pre-compute per-element VS inclusion for this near-field path.
          const nfVsPerElement = elementsWithMesh.map(el => hasNonGroundVs(el));

          if (isSweepMode && frequencySweep && frequencySweep.results && frequencySweep.results[freqIdx]) {
            const result = frequencySweep.results[freqIdx];
            if (result.antenna_solutions && result.antenna_solutions.length > 0) {
              branch_currents_for_freq = result.antenna_solutions.flatMap(
                (sol, i) => [
                  ...(sol.branch_currents || []),
                  ...(nfVsPerElement[i] ? (sol.voltage_source_currents || []) : []),
                ]
              );
            } else {
              branch_currents_for_freq = [];
            }
          } else if (multiAntennaResultsForField?.antenna_solutions?.length) {
            // Use multiAntennaResults (includes voltage_source_currents) to match
            // the VS edges that were added to the mesh above.
            branch_currents_for_freq = multiAntennaResultsForField.antenna_solutions.flatMap(
              (sol, i) => [
                ...(sol.branch_currents || []),
                ...(nfVsPerElement[i] ? (sol.voltage_source_currents || []) : []),
              ]
            );
          } else if (results && results.branch_currents) {
            branch_currents_for_freq = results.branch_currents;
          } else {
            console.error('[Postprocessing] No branch currents for freq index', freqIdx);
            return rejectWithValue('No branch currents available for field computation');
          }

          // Append known CS currents for two-terminal current source gap edges.
          for (const { element } of csEdgeElements) {
            for (const source of element.sources ?? []) {
              if (source.type === 'current'
                  && source.node_start != null && source.node_end != null
                  && source.node_start >= 1 && source.node_end >= 1) {
                branch_currents_for_freq.push(source.amplitude ?? 1.0);
              }
            }
          }

          const fieldRequest = {
            frequencies: [freqHz],
            branch_currents: [branch_currents_for_freq],
            nodes: mesh.nodes,
            edges: mesh.edges,
            radii: mesh.radii,
            observation_points,
          };

          // Pre-flight estimate: warn if computation may timeout
          const estEvals = observation_points.length * 19 * mesh.edges.length;
          const estSec = estEvals * 5e-7;
          if (freqIdx === 0) {
            console.log(
              `[Postprocessing] Field "${field.name}": ${observation_points.length} pts × ${mesh.edges.length} edges × ${frequencies.length} freqs → est. ${(estSec * frequencies.length).toFixed(1)}s total`
            );
          }
          if (estSec > 250) {
            console.warn(
              `[Postprocessing] ⚠️ Field "${field.name}" at ${(freqHz / 1e6).toFixed(2)} MHz estimated at ${estSec.toFixed(0)}s — may exceed Lambda 300s timeout!`
            );
          }

          const fieldData = await computeNearField(fieldRequest);

          dispatch(setFieldData({
            fieldId: field.id,
            frequencyHz: freqHz,
            data: {
              points: fieldRequest.observation_points as Array<[number, number, number]>,
              E_mag: fieldData.E_magnitudes,
              H_mag: fieldData.H_magnitudes,
              E_vectors: fieldData.E_field,
              H_vectors: fieldData.H_field,
            },
          }));

          completedWork++;
          dispatch(updatePostprocessingProgress({ completed: completedWork, total: totalWork }));
        }

        // Update field result after all frequencies computed for this field
        dispatch(updateFieldResult({
          fieldId: field.id,
          computed: true,
          num_points: generateObservationPoints(field).length,
        }));

        fieldResults.push({
          fieldId: field.id,
          computed: true,
          num_points: generateObservationPoints(field).length,
        });
      }

      response.fields = fieldResults;
    }

    // Check total field data size and warn if > 50 MB
    const totalFieldDataSizeMB = calculateFieldDataSize(getState().solver.fieldData);
    if (totalFieldDataSizeMB > 50) {
      console.warn(`⚠️ Large field dataset: ${totalFieldDataSizeMB.toFixed(1)} MB stored in memory`);
      console.warn('Consider reducing sampling resolution or exporting to ParaView for large datasets');
    }

    // Compute port quantities automatically (if ports are defined)
    const portElements = elements.filter(
      (el) => el.ports && el.ports.length > 0 && el.visible && !el.locked,
    );
    if (portElements.length > 0) {
      try {
        await dispatch(requestPortQuantities()).unwrap();
      } catch (portErr) {
        console.warn('[Postprocessing] Port quantities failed:', portErr);
        // Non-fatal — don't abort the workflow
      }
    }

    // Update workflow state
    dispatch(setSolverState('postprocessing-ready'));

    // Set selected frequency to first if not already set
    if (!getState().solver.selectedFrequencyHz && frequencies.length > 0) {
      dispatch(setSelectedFrequency(frequencies[0]));
    }

    // Refresh token balance after postprocessing
    dispatch(getCurrentUserAsync());

    return { ...response, totalFieldDataSizeMB };
  } catch (error: any) {
    return rejectWithValue(extractErrorMessage(error, 'Postprocessing failed'));
  }
});

/**
 * Compute radiation pattern from solver results (original — computes for all/first freq).
 * Kept for backward compatibility with single-frequency solves.
 */
export const computeRadiationPattern = createAsyncThunk<
  RadiationPatternData,
  void,
  { state: RootState }
>('solver/computeRadiationPattern', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState();
    const { results, frequencySweep, currentFrequency } = state.solver;
    const { elements } = state.design;

    const isSweepMode = frequencySweep && frequencySweep.frequencies && frequencySweep.frequencies.length > 1;
    const hasResults = results || (isSweepMode && frequencySweep.results && frequencySweep.results.length > 0);

    if (!hasResults || !elements || elements.length === 0) {
      return rejectWithValue('No solver results or mesh data available');
    }

    const { directivitySettings } = state.solver;
    const frequencies = isSweepMode ? frequencySweep.frequencies : (currentFrequency ? [currentFrequency * 1e6] : [results!.frequency]);

    const multiAntennaResult = state.solver.multiAntennaResults
      || (results as unknown as MultiAntennaSolutionResponse | null);
    const isMultiAntenna = multiAntennaResult?.antenna_solutions !== undefined;

    let combinedNodes: number[][] = [];
    let combinedEdges: number[][] = [];
    let combinedRadii: number[] = [];
    let combinedBranchCurrents: AntennaSolution['branch_currents'] = [];

    if (isMultiAntenna) {
      const antenna_solutions = multiAntennaResult.antenna_solutions;

      let nodeOffset = 0;
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (!element.mesh) continue;

        const mesh = element.mesh;
        const offsetNodes = mesh.nodes.map(node => [
          node[0] + element.position[0],
          node[1] + element.position[1],
          node[2] + element.position[2]
        ]);
        combinedNodes.push(...offsetNodes);

        const offsetEdges = mesh.edges.map(edge => [
          edge[0] + nodeOffset, edge[1] + nodeOffset
        ]);
        combinedEdges.push(...offsetEdges);
        combinedRadii.push(...mesh.radii);

        // Include voltage source edges so the far-field sees a closed current path.
        // Only for non-ground VS (both nodes >= 1) — ground node 0 has no mesh
        // position, and balanced-feed sources would cause a count mismatch.
        const elHasVs = hasNonGroundVs(element);
        if (elHasVs && element.sources) {
          for (const source of element.sources) {
            if (source.type === 'voltage'
                && source.node_start != null && source.node_end != null
                && source.node_start >= 1 && source.node_end >= 1) {
              combinedEdges.push([source.node_start + nodeOffset, source.node_end + nodeOffset]);
              combinedRadii.push(mesh.radii[0] ?? 0.001);
            }
          }
        }

        if (antenna_solutions[i]) {
          combinedBranchCurrents.push(...antenna_solutions[i].branch_currents);
          if (elHasVs && antenna_solutions[i].voltage_source_currents) {
            combinedBranchCurrents.push(...antenna_solutions[i].voltage_source_currents);
          }
        }

        // Two-terminal CS: add gap edge + known source current
        // Edge direction [node_end → node_start] so positive current completes loop.
        if (element.sources) {
          for (const source of element.sources) {
            if (source.type === 'current'
                && source.node_start != null && source.node_end != null
                && source.node_start >= 1 && source.node_end >= 1) {
              combinedEdges.push([source.node_end + nodeOffset, source.node_start + nodeOffset]);
              combinedRadii.push(mesh.radii[0] ?? 0.001);
              combinedBranchCurrents.push(source.amplitude ?? 1.0);
            }
          }
        }

        nodeOffset += mesh.nodes.length;
      }
    } else {
      const element = elements[0];
      if (!element.mesh) return rejectWithValue('No mesh data available');

      combinedNodes = element.mesh.nodes;
      combinedEdges = [...element.mesh.edges];
      combinedRadii = [...element.mesh.radii];
      combinedBranchCurrents = [...results!.branch_currents];

      // Include voltage source edges + currents only for non-ground VS.
      const vsCurrents = multiAntennaResult?.antenna_solutions?.[0]?.voltage_source_currents;
      if (vsCurrents && vsCurrents.length > 0 && hasNonGroundVs(element) && element.sources) {
        for (const source of element.sources) {
          if (source.type === 'voltage'
              && source.node_start != null && source.node_end != null
              && source.node_start >= 1 && source.node_end >= 1) {
            combinedEdges.push([source.node_start, source.node_end]);
            combinedRadii.push(element.mesh.radii[0] ?? 0.001);
          }
        }
        combinedBranchCurrents.push(...vsCurrents);
      }

      // Two-terminal CS: add gap edge + known source current (single-antenna path)
      // Edge direction [node_end → node_start] so positive current completes loop.
      if (element.sources) {
        for (const source of element.sources) {
          if (source.type === 'current'
              && source.node_start != null && source.node_end != null
              && source.node_start >= 1 && source.node_end >= 1) {
            combinedEdges.push([source.node_end, source.node_start]);
            combinedRadii.push(element.mesh.radii[0] ?? 0.001);
            combinedBranchCurrents.push(source.amplitude ?? 1.0);
          }
        }
      }
    }

    // For sweep mode, build per-frequency currents with same VS filtering.
    // Also append known CS currents for two-terminal current source gap edges.
    const legacyVsPerElement = elements.filter(el => el.mesh).map(el => hasNonGroundVs(el));
    const legacyCsCurrents: AntennaSolution['branch_currents'] = [];
    for (const el of elements.filter(e => e.mesh)) {
      for (const source of el.sources ?? []) {
        if (source.type === 'current'
            && source.node_start != null && source.node_end != null
            && source.node_start >= 1 && source.node_end >= 1) {
          legacyCsCurrents.push(source.amplitude ?? 1.0);
        }
      }
    }
    const branch_currents_array = isSweepMode
      ? frequencySweep.results.map(r =>
          r.antenna_solutions && r.antenna_solutions.length > 0
            ? [
                ...r.antenna_solutions.flatMap((sol, i) => [
                  ...(sol.branch_currents || []),
                  ...(legacyVsPerElement[i] ? (sol.voltage_source_currents || []) : []),
                ]),
                ...legacyCsCurrents,
              ]
            : []
        )
      : [combinedBranchCurrents];

    const request = {
      frequencies: frequencies,
      branch_currents: branch_currents_array,
      nodes: combinedNodes,
      edges: combinedEdges,
      radii: combinedRadii,
      theta_points: directivitySettings.theta_points,
      phi_points: directivitySettings.phi_points,
    };

    const pattern = await computeFarField(request);
    return pattern;
  } catch (error: any) {
    return rejectWithValue(extractErrorMessage(error, 'Far-field computation failed'));
  }
});

/**
 * Compute radiation pattern for a single frequency from sweep results.
 * Called once per frequency during multi-frequency postprocessing.
 */
export const computeRadiationPatternForFrequency = createAsyncThunk<
  RadiationPatternData,
  { frequencyIndex: number },
  { state: RootState }
>('solver/computeRadiationPatternForFrequency', async ({ frequencyIndex }, { getState, rejectWithValue }) => {
  try {
    const state = getState();
    const { results, frequencySweep, currentFrequency } = state.solver;
    const { elements } = state.design;

    const isSweepMode = frequencySweep && frequencySweep.frequencies && frequencySweep.frequencies.length > 1;
    const hasResults = results || (isSweepMode && frequencySweep.results && frequencySweep.results.length > 0);

    if (!hasResults || !elements || elements.length === 0) {
      return rejectWithValue('No solver results or mesh data available');
    }

    const { directivitySettings } = state.solver;

    // Get the single frequency and its branch currents
    let freqHz: number;
    let branchCurrentsForFreq: AntennaSolution['branch_currents'];
    let includeVsEdges = false;

    // Pre-compute which elements have non-ground VS (both source nodes >= 1).
    // Ground-referencing VS edges can't be added to the mesh (no physical
    // position for node 0) and balanced-feed dipoles merge 2 sources into
    // 1 solver VS — so including them would cause an edge/current mismatch.
    const elementsWithMesh = elements.filter(el => el.mesh);
    const vsPerElement = elementsWithMesh.map(el => hasNonGroundVs(el));

    if (isSweepMode) {
      freqHz = frequencySweep.frequencies[frequencyIndex];
      const result = frequencySweep.results[frequencyIndex];
      if (result.antenna_solutions && result.antenna_solutions.length > 0) {
        branchCurrentsForFreq = result.antenna_solutions.flatMap(
          (sol, i) => [
            ...(sol.branch_currents || []),
            ...(vsPerElement[i] ? (sol.voltage_source_currents || []) : []),
          ]
        );
        includeVsEdges = true;
      } else {
        return rejectWithValue(`No antenna solutions for frequency index ${frequencyIndex}`);
      }
    } else {
      freqHz = currentFrequency ? currentFrequency * 1e6 : results!.frequency;
      const multiAntennaResult = state.solver.multiAntennaResults
        || (results as unknown as MultiAntennaSolutionResponse | null);
      const isMultiAntenna = multiAntennaResult?.antenna_solutions !== undefined;

      if (isMultiAntenna) {
        branchCurrentsForFreq = multiAntennaResult.antenna_solutions.flatMap(
          (sol, i) => [
            ...(sol.branch_currents || []),
            ...(vsPerElement[i] ? (sol.voltage_source_currents || []) : []),
          ]
        );
        includeVsEdges = true;
      } else {
        branchCurrentsForFreq = results!.branch_currents;
        includeVsEdges = false;
      }
    }

    // Build combined mesh from all elements
    const combinedNodes: number[][] = [];
    const combinedEdges: number[][] = [];
    const combinedRadii: number[] = [];
    let nodeOffset = 0;

    for (const element of elements) {
      if (!element.mesh) continue;
      const mesh = element.mesh;
      const pos = element.position || [0, 0, 0];
      const offsetNodes = mesh.nodes.map(node => [
        node[0] + pos[0],
        node[1] + pos[1],
        node[2] + pos[2]
      ]);
      combinedNodes.push(...offsetNodes);

      const offsetEdges = mesh.edges.map(edge => [
        edge[0] + nodeOffset, edge[1] + nodeOffset
      ]);
      combinedEdges.push(...offsetEdges);
      combinedRadii.push(...mesh.radii);

      // Include voltage source edges so the far-field sees a closed current path.
      // Only add for non-ground VS (node_start >= 1 && node_end >= 1) to match
      // the currents included above and avoid invalid ground-node references.
      if (includeVsEdges && element.sources) {
        for (const source of element.sources) {
          if (source.type === 'voltage'
              && source.node_start != null && source.node_end != null
              && source.node_start >= 1 && source.node_end >= 1) {
            combinedEdges.push([source.node_start + nodeOffset, source.node_end + nodeOffset]);
            combinedRadii.push(mesh.radii[0] ?? 0.001);
          }
        }
      }

      // Include two-terminal current source edges.  The wire edge at the feed
      // gap was removed during meshing; re-add it here with the known source
      // current so the far-field sees a complete closed loop.
      // Edge direction is [node_end → node_start] so positive current flows in
      // the same direction as the other wire edges (completing the loop).
      if (element.sources) {
        for (const source of element.sources) {
          if (source.type === 'current'
              && source.node_start != null && source.node_end != null
              && source.node_start >= 1 && source.node_end >= 1) {
            combinedEdges.push([source.node_end + nodeOffset, source.node_start + nodeOffset]);
            combinedRadii.push(mesh.radii[0] ?? 0.001);
            branchCurrentsForFreq.push(source.amplitude ?? 1.0);
          }
        }
      }

      nodeOffset += mesh.nodes.length;
    }

    if (combinedNodes.length === 0) {
      return rejectWithValue('No mesh data available');
    }

    const request = {
      frequencies: [freqHz],
      branch_currents: [branchCurrentsForFreq],
      nodes: combinedNodes,
      edges: combinedEdges,
      radii: combinedRadii,
      theta_points: directivitySettings.theta_points,
      phi_points: directivitySettings.phi_points,
    };

    const pattern = await computeFarField(request);
    return pattern;
  } catch (error: any) {
    return rejectWithValue(extractErrorMessage(error, 'Far-field computation failed'));
  }
});

// ============================================================================
// Port Quantities
// ============================================================================

import { computePortQuantities } from '@/api/postprocessor';
import type { PortQuantitiesRequestInput, PortQuantitiesResponseOutput } from '@/api/postprocessor';

/**
 * Request port quantities for antennas that have ports defined.
 * Uses solver results + port definitions from AntennaElement.ports.
 */
export const requestPortQuantities = createAsyncThunk<
  Record<string, PortQuantitiesResponseOutput>,
  void,
  { state: RootState }
>('solver/requestPortQuantities', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState();
    const { results, multiAntennaResults } = state.solver;
    const { elements } = state.design;

    if (!multiAntennaResults && !results) {
      return rejectWithValue('No solver results available. Run solver first.');
    }

    // Collect elements that have ports
    const elementsWithPorts = elements.filter(
      (el) => el.ports && el.ports.length > 0 && el.visible && !el.locked
    );

    if (elementsWithPorts.length === 0) {
      return rejectWithValue('No elements have ports defined. Add ports in the circuit editor.');
    }

    const portResultsMap: Record<string, PortQuantitiesResponseOutput> = {};

    // Get frequency from results
    const frequency = multiAntennaResults?.frequency || results?.frequency || 0;

    for (const element of elementsWithPorts) {
      // Find matching antenna solution
      const solution = multiAntennaResults?.antenna_solutions?.find(
        (s) => s.antenna_id === element.id
      );

      if (!solution) continue;

      const request: PortQuantitiesRequestInput = {
        frequency,
        antenna_id: element.id,
        node_voltages: parseComplexArray(solution.node_voltages),
        branch_currents: parseComplexArray(solution.branch_currents),
        appended_voltages: parseComplexArray(solution.appended_voltages || []),
        voltage_source_currents: parseComplexArray(solution.voltage_source_currents || []),
        edges: element.mesh?.edges || [],
        ports: element.ports!.map((p) => ({
          port_id: p.id,
          node_start: p.node_start,
          node_end: p.node_end,
          z0: p.z0,
        })),
      };

      const result = await computePortQuantities(request);
      portResultsMap[element.id] = result;
    }

    return portResultsMap;
  } catch (error: any) {
    return rejectWithValue(extractErrorMessage(error, 'Port quantities computation failed'));
  }
});

// ============================================================================
// Slice
// ============================================================================

const solverSlice = createSlice({
  name: 'solver',
  initialState,
  reducers: {
    // Update progress
    setProgress: (state, action: PayloadAction<number>) => {
      state.progress = Math.min(100, Math.max(0, action.payload));
    },
    setSweepProgress: (state, action: PayloadAction<{ current: number; total: number } | null>) => {
      state.sweepProgress = action.payload;
    },

    // Clear results
    clearResults: (state) => {
      state.results = null;
      state.currentDistribution = null;
      state.multiAntennaResults = null;
      state.error = null;
      state.progress = 0;
      state.status = 'idle';
    },

    // Reset solver state
    resetSolver: () => initialState,

    // Field definition management
    addFieldRegion: (state, action: PayloadAction<FieldDefinition>) => {
      state.requestedFields.push(action.payload);
    },

    deleteFieldRegion: (state, action: PayloadAction<string>) => {
      state.requestedFields = state.requestedFields.filter(
        field => field.id !== action.payload
      );
      // Remove field result when field is deleted
      if (state.fieldResults && state.fieldResults[action.payload]) {
        delete state.fieldResults[action.payload];
      }
    },

    updateFieldRegion: (state, action: PayloadAction<{ id: string; updates: Partial<FieldDefinition> }>) => {
      const index = state.requestedFields.findIndex(f => f.id === action.payload.id);
      if (index !== -1) {
        state.requestedFields[index] = {
          ...state.requestedFields[index],
          ...action.payload.updates,
        } as FieldDefinition;

        // Mark result as outdated when computation-affecting properties change
        // (everything except cosmetic props like name, visible, opacity)
        const cosmeticKeys = new Set(['name', 'visible', 'opacity']);
        const hasComputationChange = Object.keys(action.payload.updates).some(
          key => !cosmeticKeys.has(key)
        );
        if (hasComputationChange && state.fieldResults?.[action.payload.id]) {
          state.fieldResults[action.payload.id] = { computed: false, num_points: 0 };
        }
      }
    },

    clearFieldRegions: (state) => {
      state.requestedFields = [];
    },

    setFieldDefinitions: (state, action: PayloadAction<FieldDefinition[]>) => {
      state.requestedFields = action.payload;
    },

    loadSolverState: (state, action: PayloadAction<Partial<SolverState> | undefined>) => {
      if (!action.payload) return;

      // Restore solver state from database, preserving runtime-only state
      const savedState = action.payload;

      // Restore results and computed data
      if (savedState.results !== undefined) state.results = savedState.results;
      if (savedState.currentDistribution !== undefined) state.currentDistribution = savedState.currentDistribution;
      if (savedState.radiationPattern !== undefined) state.radiationPattern = savedState.radiationPattern;
      if (savedState.multiAntennaResults !== undefined) state.multiAntennaResults = savedState.multiAntennaResults;
      if (savedState.frequencySweep !== undefined) state.frequencySweep = savedState.frequencySweep;
      if (savedState.resultsHistory !== undefined) state.resultsHistory = savedState.resultsHistory;

      // Restore field data and state
      if (savedState.requestedFields !== undefined) state.requestedFields = savedState.requestedFields;
      if (savedState.directivityRequested !== undefined) {
        state.directivityRequested = savedState.directivityRequested;
      } else {
        // Default to cleared directivity when not present in project state
        state.directivityRequested = initialState.directivityRequested;
      }
      if (savedState.directivitySettings !== undefined) state.directivitySettings = savedState.directivitySettings;
      if (savedState.solverState !== undefined) state.solverState = savedState.solverState;
      if (savedState.currentFrequency !== undefined) state.currentFrequency = savedState.currentFrequency;
      if (savedState.fieldResults !== undefined) state.fieldResults = savedState.fieldResults;
      if (savedState.fieldData !== undefined) {
        state.fieldData = savedState.fieldData;
        // Debug: log field data restoration for diagnosing load issues
        if (savedState.fieldData) {
          const fieldIds = Object.keys(savedState.fieldData);
          console.log('[loadSolverState] Restored fieldData:', {
            fieldIds,
            frequencyKeys: fieldIds.map(id => Object.keys(savedState.fieldData![id])),
          });
        }
      }

      if (savedState.radiationPatterns !== undefined) state.radiationPatterns = savedState.radiationPatterns;
      if (savedState.selectedFrequencyHz !== undefined) state.selectedFrequencyHz = savedState.selectedFrequencyHz;

      // Restore sweep-specific state
      if (savedState.solveMode !== undefined) state.solveMode = savedState.solveMode;
      if (savedState.parameterStudy !== undefined) state.parameterStudy = savedState.parameterStudy;
      if (savedState.parameterStudyConfig !== undefined) state.parameterStudyConfig = savedState.parameterStudyConfig;
      if (savedState.selectedSweepPointIndex !== undefined) state.selectedSweepPointIndex = savedState.selectedSweepPointIndex;

      // Don't restore status/progress/error/jobId - these are runtime state
      // Don't restore currentRequest - this is transient
      // Don't restore sweepInProgress - this is runtime state
      // Don't restore postprocessingStatus/postprocessingProgress - these are runtime state
      // Don't restore resultsStale - we assume restored results are valid
    },

    setDirectivityRequested: (state, action: PayloadAction<boolean>) => {
      state.directivityRequested = action.payload;
    },

    setDirectivitySettings: (state, action: PayloadAction<{ theta_points: number; phi_points: number }>) => {
      state.directivitySettings = action.payload;
    },

    setSolverState: (state, action: PayloadAction<SolverWorkflowState>) => {
      state.solverState = action.payload;
    },

    setSolveMode: (state, action: PayloadAction<SolveMode>) => {
      state.solveMode = action.payload;
    },

    setCurrentFrequency: (state, action: PayloadAction<number>) => {
      state.currentFrequency = action.payload;
    },

    /** Set the globally selected frequency (Hz) for postprocessing display */
    setSelectedFrequency: (state, action: PayloadAction<number | null>) => {
      state.selectedFrequencyHz = action.payload;
      // When frequency changes, update radiationPattern to match for backward compat
      if (action.payload !== null && state.radiationPatterns?.[action.payload]) {
        state.radiationPattern = state.radiationPatterns[action.payload];
      }
    },

    /** Store a radiation pattern for a specific frequency (Hz) */
    setRadiationPatternForFrequency: (state, action: PayloadAction<{
      frequencyHz: number;
      pattern: RadiationPatternData;
    }>) => {
      if (!state.radiationPatterns) {
        state.radiationPatterns = {};
      }
      state.radiationPatterns[action.payload.frequencyHz] = action.payload.pattern;
      // Backward compat: keep radiationPattern in sync with selectedFrequencyHz
      if (
        state.selectedFrequencyHz === action.payload.frequencyHz ||
        state.selectedFrequencyHz == null
      ) {
        state.radiationPattern = action.payload.pattern;
      }
    },

    /** Set the selected sweep point index for postprocessing slider navigation */
    setSweepPointIndex: (state, action: PayloadAction<number>) => {
      state.selectedSweepPointIndex = action.payload;
    },

  updateFieldResult: (state, action: PayloadAction<{ fieldId: string; computed: boolean; num_points: number }>) => {
    if (!state.fieldResults) {
      state.fieldResults = {};
    }
    state.fieldResults[action.payload.fieldId] = {
      computed: action.payload.computed,
      num_points: action.payload.num_points,
    };
  },
  updatePostprocessingProgress: (state, action: PayloadAction<{ completed: number; total: number }>) => {
    state.postprocessingProgress = action.payload;
  },

  cancelPostprocessing: (state) => {
    state.postprocessingStatus = 'idle';
    state.postprocessingProgress = null;
    state.progress = 0;
  },

  // Field data storage actions
  setFieldData: (state, action: PayloadAction<{
    fieldId: string;
    frequencyHz: number;
    data: {
      points: Array<[number, number, number]>;
      E_mag?: number[];
      H_mag?: number[];
      E_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>;
      H_vectors?: Array<{ x: { real: number; imag: number }; y: { real: number; imag: number }; z: { real: number; imag: number } }>;
    };
  }>) => {
    if (!state.fieldData) {
      state.fieldData = {};
    }
    if (!state.fieldData[action.payload.fieldId]) {
      state.fieldData[action.payload.fieldId] = {};
    }
    state.fieldData[action.payload.fieldId][action.payload.frequencyHz] = action.payload.data;
  },

  clearFieldData: (state) => {
    state.fieldData = null;
    state.radiationPatterns = null;
  },

  clearFieldDataForField: (state, action: PayloadAction<string>) => {
    if (state.fieldData && state.fieldData[action.payload]) {
      delete state.fieldData[action.payload];
    }
  },

  // Results validity actions
  markResultsStale: (state) => {
    state.resultsStale = true;
  },

  clearResultsStaleFlag: (state) => {
    state.resultsStale = false;
  },
  },
  extraReducers: (builder) => {
    // ========================================================================
    // Run Multi-Antenna Simulation
    // ========================================================================
    builder.addCase(runMultiAntennaSimulation.pending, (state) => {
      state.status = 'preparing';
      state.progress = 0;
      state.error = null;
      state.multiAntennaResults = null;

      // Clear old results when new solve starts
      state.results = null;
      state.currentDistribution = null;
      state.radiationPattern = null;
      state.radiationPatterns = null;
      state.selectedFrequencyHz = null;
      state.frequencySweep = null;
      state.fieldResults = null;
      state.fieldData = null;
      state.portResults = null;
      state.resultsStale = false; // New results incoming
    });

    builder.addCase(runMultiAntennaSimulation.fulfilled, (state, action) => {
      state.status = 'completed';
      state.progress = 100;
      state.multiAntennaResults = action.payload;
      state.resultsStale = false; // Fresh results, not stale

      // Clear field results when new solution is computed (fields need recomputing)
      state.fieldResults = null;
      state.postprocessingStatus = 'idle';

      // For backward compatibility: if single antenna, also populate results field
      if (action.payload.antenna_solutions.length === 1) {
        const solution = action.payload.antenna_solutions[0];

        // Calculate input impedance from voltage source currents if not provided
        let inputImpedance = parseComplex(solution.input_impedance);

        if ((!solution.input_impedance || (inputImpedance.real === 0 && inputImpedance.imag === 0))
            && solution.voltage_source_currents && solution.voltage_source_currents.length > 0) {
          // Sum all voltage source currents (for split sources)
          const sourceCurrents = parseComplexArray(solution.voltage_source_currents);

          const totalSourceCurrent = sourceCurrents.reduce((sum, current) => ({
            real: sum.real + current.real,
            imag: sum.imag + current.imag
          }), { real: 0, imag: 0 });

          // Z = V / I, assuming V = 1V (normalized)
          const I_mag_sq = totalSourceCurrent.real ** 2 + totalSourceCurrent.imag ** 2;

          if (I_mag_sq > 1e-20) {
            // Z = V / I = 1 / I for normalized voltage
            // 1 / (a + jb) = (a - jb) / (a^2 + b^2)
            inputImpedance = {
              real: totalSourceCurrent.real / I_mag_sq,
              imag: -totalSourceCurrent.imag / I_mag_sq
            };
          } else {
            // No significant source current — impedance left as default
          }
        }

        state.results = {
          project_id: 'default',
          frequency: action.payload.frequency,
          omega: action.payload.frequency * 2 * Math.PI,
          converged: action.payload.converged,
          branch_currents: parseComplexArray(solution.branch_currents),
          node_voltages: parseComplexArray(solution.node_voltages),
          appended_voltages: parseComplexArray(solution.appended_voltages),
          input_impedance: inputImpedance,
          input_current: { real: 0, imag: 0 }, // Not provided by multi-antenna API
          reflection_coefficient: { real: 0, imag: 0 },
          return_loss: 0,
          input_power: 0,
          reflected_power: 0,
          accepted_power: 0,
          power_dissipated: 0,
          solve_time: action.payload.solve_time,
        } as SolverResult;

        // Calculate current distribution for visualization
        state.currentDistribution = parseComplexArray(solution.branch_currents).map((current) => {
          const real = current.real || 0;
          const imag = current.imag || 0;
          return Math.sqrt(real * real + imag * imag);
        });
      } else {
        // Multiple antennas: store the full multi-antenna response for postprocessing
        // and combine all branch currents for visualization
        state.results = {
          project_id: 'default',
          frequency: action.payload.frequency,
          omega: action.payload.frequency * 2 * Math.PI,
          converged: action.payload.converged,
          // Store antenna_solutions in the results for postprocessing
          antenna_solutions: action.payload.antenna_solutions,
          solve_time: action.payload.solve_time,
        } as any; // Multi-antenna results have a different shape

        const allCurrents: number[] = [];
        for (const solution of action.payload.antenna_solutions) {
          const currents = parseComplexArray(solution.branch_currents).map((current) => {
            const real = current.real || 0;
            const imag = current.imag || 0;
            return Math.sqrt(real * real + imag * imag);
          });

          allCurrents.push(...currents);
        }
        state.currentDistribution = allCurrents;
      }
    });

    builder.addCase(runMultiAntennaSimulation.rejected, (state, action) => {
      state.status = 'failed';
      state.error = action.payload as string || 'Multi-antenna simulation failed';
      state.progress = 0;
    });

    // computeRadiationPattern
    builder.addCase(computeRadiationPattern.pending, (_state) => {
      // No-op: progress tracked by parent workflow
    });

    builder.addCase(computeRadiationPattern.fulfilled, (state, action) => {
      state.radiationPattern = action.payload;
    });

    builder.addCase(computeRadiationPattern.rejected, (state, _action) => {
      state.radiationPattern = null;
    });

    // ========================================================================
    // Frequency Sweep
    // ========================================================================
    builder.addCase(runFrequencySweep.pending, (state) => {
      state.sweepInProgress = true;
      state.sweepProgress = null;
      state.status = 'running';
      state.progress = 0;
      state.error = null;
      state.frequencySweep = null;

      // Clear old results when new sweep starts
      state.results = null;
      state.currentDistribution = null;
      state.radiationPattern = null;
      state.radiationPatterns = null;
      state.selectedFrequencyHz = null;
      state.multiAntennaResults = null;
      state.fieldResults = null;
      state.fieldData = null;
      state.resultsStale = false; // New results incoming
    });

    builder.addCase(runFrequencySweep.fulfilled, (state, action) => {
      state.sweepInProgress = false;
      state.sweepProgress = null;
      state.status = 'completed';
      state.progress = 100;
      state.frequencySweep = action.payload;
      state.solverState = 'solved'; // Enable postprocessing after sweep
      state.resultsStale = false; // Fresh results, not stale
      // Default selected frequency to first sweep frequency
      if (action.payload.frequencies && action.payload.frequencies.length > 0) {
        state.selectedFrequencyHz = action.payload.frequencies[0];
      }
    });

    builder.addCase(runFrequencySweep.rejected, (state, action) => {
      state.sweepInProgress = false;
      state.status = 'failed';
      state.error = action.payload as string || 'Frequency sweep failed';
      state.progress = 0;
    });

    // ========================================================================
    // Solve Single Frequency Workflow
    // ========================================================================
    builder.addCase(solveSingleFrequencyWorkflow.pending, (state) => {
      state.status = 'running';
      state.progress = 0;
      state.error = null;
    });

    builder.addCase(solveSingleFrequencyWorkflow.fulfilled, (state, _action) => {
      state.status = 'completed';
      state.progress = 100;
      // Clear sweep data — single solve is mutually exclusive with sweep
      state.parameterStudy = null;
      state.parameterStudyConfig = null;
      state.selectedSweepPointIndex = 0;
    });

    builder.addCase(solveSingleFrequencyWorkflow.rejected, (state, action) => {
      state.status = 'failed';
      state.error = action.payload as string || 'Solve workflow failed';
      state.progress = 0;
      state.solverState = 'idle'; // Reset workflow state on error
    });

    // ========================================================================
    // Compute Postprocessing Workflow
    // ========================================================================
    builder.addCase(computePostprocessingWorkflow.pending, (state) => {
      state.postprocessingStatus = 'running';
      state.progress = 50;
      state.error = null;
      state.postprocessingProgress = { completed: 0, total: 0 };
    });

    builder.addCase(computePostprocessingWorkflow.fulfilled, (state, action) => {
      state.postprocessingStatus = 'completed';
      state.progress = 100;
      state.postprocessingProgress = null; // Clear progress indicator

      // Store field computation results (already updated incrementally, but ensure final state)
      if (action.payload.fields) {
        if (!state.fieldResults) {
          state.fieldResults = {};
        }
        for (const field of action.payload.fields) {
          state.fieldResults[field.fieldId] = {
            computed: field.computed,
            num_points: (field as any).num_points || 0,
          };
        }
      }

    });

    builder.addCase(computePostprocessingWorkflow.rejected, (state, action) => {
      state.postprocessingStatus = 'failed';
      state.error = action.payload as string || 'Postprocessing workflow failed';
      state.progress = 0;
      state.postprocessingProgress = null;
    });

    // ========================================================================
    // Parameter Study
    // ========================================================================
    builder.addCase(runParameterStudy.pending, (state) => {
      state.status = 'running';
      state.error = null;
      state.sweepInProgress = true;
      state.parameterStudy = null;
    });
    builder.addCase(runParameterStudy.fulfilled, (state, action) => {
      console.log('[solverSlice] runParameterStudy.fulfilled — setting solveMode to sweep');
      state.status = 'completed';
      state.parameterStudy = action.payload;
      state.parameterStudyConfig = action.payload.config;
      state.sweepInProgress = false;
      state.solverState = 'solved';
      state.solveMode = 'sweep';
      state.progress = 100;
      state.resultsStale = false; // Sweep results are fresh

      // Build frequencySweep from parameter study results so the postprocessing
      // and FrequencySelector infrastructure can iterate over all frequencies.
      const studyResults = action.payload.results;
      if (studyResults.length > 0) {
        // Extract unique frequencies in order of appearance
        const seenFreqs = new Set<number>();
        const frequencies: number[] = [];
        const sweepResultsByFreq: Record<number, MultiAntennaSolutionResponse> = {};

        for (const r of studyResults) {
          const resp = r.solverResponse as MultiAntennaSolutionResponse;
          const f = resp.frequency;
          if (!seenFreqs.has(f)) {
            seenFreqs.add(f);
            frequencies.push(f);
            sweepResultsByFreq[f] = resp;
          }
        }

        state.frequencySweep = {
          frequencies,
          results: frequencies.map((f) => sweepResultsByFreq[f]),
          completedCount: frequencies.length,
          totalCount: frequencies.length,
          isComplete: true,
          currentDistributions: [],
        };

        // Set the nominal frequency (last solve) as the selected frequency
        if (state.multiAntennaResults) {
          state.currentFrequency = state.multiAntennaResults.frequency / 1e6;
        }
      }
    });
    builder.addCase(runParameterStudy.rejected, (state, action) => {
      console.error('[solverSlice] runParameterStudy.rejected:', action.payload);
      state.status = 'failed';
      state.error = action.payload as string || 'Parameter study failed';
      state.sweepInProgress = false;
      state.progress = 0;
    });

    // ========================================================================
    // Port Quantities
    // ========================================================================
    builder.addCase(requestPortQuantities.pending, (state) => {
      state.postprocessingStatus = 'running';
      state.error = null;
    });
    builder.addCase(requestPortQuantities.fulfilled, (state, action) => {
      state.postprocessingStatus = 'idle';
      state.portResults = action.payload;
    });
    builder.addCase(requestPortQuantities.rejected, (state, action) => {
      state.postprocessingStatus = 'idle';
      state.error = action.payload as string || 'Port quantities failed';
    });

    // ========================================================================
    // Listen to design changes to mark results as stale
    // ========================================================================
    builder.addMatcher(
      (action) => {
        // Mark results stale when geometry or sources change
        return action.type.startsWith('design/') && (
          action.type === 'design/addElement' ||
          action.type === 'design/updateElement' ||
          action.type === 'design/removeElement' ||
          action.type === 'design/addSource' ||
          action.type === 'design/updateSource' ||
          action.type === 'design/deleteSource' ||
          action.type === 'design/addLumpedElement' ||
          action.type === 'design/updateLumpedElement' ||
          action.type === 'design/deleteLumpedElement'
        );
      },
      (state, _action) => {
        // Only mark stale if we have results
        if (state.results || state.multiAntennaResults || state.frequencySweep) {
          state.resultsStale = true;
        }
      }
    );
  },
});

// ============================================================================
// Exports
// ============================================================================

export const {
  setProgress,
  setSweepProgress,
  clearResults,
  resetSolver,
  addFieldRegion,
  deleteFieldRegion,
  updateFieldRegion,
  clearFieldRegions,
  setFieldDefinitions,
  loadSolverState,
  setDirectivityRequested,
  setDirectivitySettings,
  setSolverState,
  setSolveMode,
  setCurrentFrequency,
  updateFieldResult,
  updatePostprocessingProgress,
  cancelPostprocessing,
  setFieldData,
  clearFieldData,
  clearFieldDataForField,
  markResultsStale,
  clearResultsStaleFlag,
  setSelectedFrequency,
  setRadiationPatternForFrequency,
  setSweepPointIndex,
} = solverSlice.actions;

// Selectors
export const selectSolveMode = (state: RootState) => state.solver.solveMode;
export const selectSolverStatus = (state: RootState) => state.solver.status;
export const selectSolverProgress = (state: RootState) => state.solver.progress;
export const selectSolverError = (state: RootState) => state.solver.error;
export const selectSolverResults = (state: RootState) => state.solver.results;
export const selectCurrentDistribution = (state: RootState) => state.solver.currentDistribution;
export const selectResultsHistory = (state: RootState) => state.solver.resultsHistory;
export const selectFrequencySweep = (state: RootState) => state.solver.frequencySweep;
export const selectSweepInProgress = (state: RootState) => state.solver.sweepInProgress;
export const selectSweepProgress = (state: RootState) => state.solver.sweepProgress;
export const selectRadiationPattern = (state: RootState) => state.solver.radiationPattern;

// Field and postprocessing selectors
// Cast needed: Immer's WritableNonArrayDraft mangles Zod-inferred tuple types (centerPoint)
export const selectRequestedFields = (state: RootState) =>
  state.solver.requestedFields as FieldDefinition[];
export const selectRequestedFieldById = (state: RootState, id: string) =>
  state.solver.requestedFields.find(f => f.id === id) as FieldDefinition | undefined;
export const selectDirectivityRequested = (state: RootState) => state.solver.directivityRequested;
export const selectDirectivitySettings = (state: RootState) => state.solver.directivitySettings;
export const selectSolverState = (state: RootState) => state.solver.solverState;
export const selectCurrentFrequency = (state: RootState) => state.solver.currentFrequency;
export const selectFieldData = (state: RootState) => state.solver.fieldData;
export const selectResultsStale = (state: RootState) => state.solver.resultsStale;
export const selectSelectedFrequencyHz = (state: RootState) => state.solver.selectedFrequencyHz;
export const selectRadiationPatterns = (state: RootState) => state.solver.radiationPatterns;

// Parameter study selectors
export const selectParameterStudy = (state: RootState) => state.solver.parameterStudy;
export const selectParameterStudyConfig = (state: RootState) => state.solver.parameterStudyConfig;
export const selectSweepPointIndex = (state: RootState) => state.solver.selectedSweepPointIndex;

// Port quantity selectors
export const selectPortResults = (state: RootState) => state.solver.portResults;

export default solverSlice.reducer;
