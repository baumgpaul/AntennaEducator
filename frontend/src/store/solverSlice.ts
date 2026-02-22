/**
 * Solver Redux Slice
 * Manages simulation execution, progress tracking, and results
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { SolverRequest, SolverResult, Mesh, Source } from '@/types/models';
import type { MultiAntennaRequest, MultiAntennaSolutionResponse, FrequencySweepParams, FrequencySweepResult } from '@/types/api';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import { solveSingle, solveMultiAntenna } from '@/api/solver';
import { computeFarField, computeNearField } from '@/api/postprocessor';
import { generateObservationPoints } from '@/utils/fieldGeneration';

// ============================================================================
// Helper Functions
// ============================================================================

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

// ============================================================================
// Types
// ============================================================================

export type SimulationStatus = 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SolverWorkflowState = 'idle' | 'solved' | 'postprocessing-ready';

interface SolverState {
  // Current simulation
  status: SimulationStatus;
  progress: number; // 0-100
  error: string | null;

  // Current simulation parameters
  currentRequest: SolverRequest | null;

  // Results
  results: SolverResult | null;
  currentDistribution: number[] | null; // Magnitude of branch currents for visualization
  radiationPattern: {
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
  } | null;

  // Multi-antenna results
  multiAntennaResults: MultiAntennaSolutionResponse | null;

  // Frequency sweep results
  frequencySweep: FrequencySweepResult | null;
  sweepInProgress: boolean;

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

  // Results validity tracking
  resultsStale: boolean; // True when geometry/sources changed and results are outdated
}

const initialState: SolverState = {
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
  resultsStale: false,
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
    const errorMessage = error.response?.data?.detail || error.message || 'Multi-antenna simulation failed';
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

    return sweepResult;
  } catch (error: any) {
    return rejectWithValue(error.message || 'Frequency sweep failed');
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

    // Prepare multi-antenna request
    const antennaRequests = elements.map((element) => {
      if (!element.mesh) {
        throw new Error(`Element ${element.name} has no mesh`);
      }

      // Split sources into voltage and current sources
      const allSources = element.sources || [];
      const voltage_sources = allSources
        .filter((s) => s.type === 'voltage')
        .map((s) => ({
          node_start: s.node_start,
          node_end: s.node_end,
          value: typeof s.amplitude === 'number' ? s.amplitude :
                 typeof s.amplitude === 'string' ? parseFloat(s.amplitude) :
                 (s.amplitude as any).real || 1.0,
          R: s.series_R || 0,
          L: s.series_L || 0,
          C_inv: s.series_C_inv || 0,
        }));

      const current_sources = allSources
        .filter((s) => s.type === 'current')
        .map((s) => ({
          node: s.node_start,  // Use primary node for current source
          value: typeof s.amplitude === 'number' ? s.amplitude :
                 typeof s.amplitude === 'string' ? parseFloat(s.amplitude) :
                 (s.amplitude as any).real || 1.0,
        }));

      // Map lumped elements to loads
      const loads = (element.lumped_elements || []).map((le) => ({
        node_start: le.node_start,
        node_end: le.node_end,
        R: le.R,
        L: le.L,
        C_inv: le.C_inv,
      }));

      return {
        antenna_id: element.id,
        nodes: element.mesh.nodes,
        edges: element.mesh.edges,
        radii: element.mesh.radii,
        voltage_sources,
        current_sources,
        loads,
      };
    });

    const request: MultiAntennaRequest = {
      frequency: frequencyMHz * 1e6, // Convert MHz to Hz
      antennas: antennaRequests,
    };

    // Call multi-antenna solver (handles single antenna too)
    const result = await dispatch(runMultiAntennaSimulation(request)).unwrap();

    // Update workflow state
    dispatch(setSolverState('solved'));
    dispatch(setCurrentFrequency(frequencyMHz));

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
    return rejectWithValue(error.message || 'Solve failed');
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
    const { results, directivityRequested, frequencySweep, currentFrequency } = state.solver;
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
    });

    // Check for either single solve results or sweep results
    const isSweepMode = frequencySweep && frequencySweep.frequencies && frequencySweep.frequencies.length > 1;
    const hasResults = results || (isSweepMode && frequencySweep.results && frequencySweep.results.length > 0);

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

    // For sweep mode, branch_currents are in antenna_solutions, not at top level
    const isMultiAntenna = (referenceResult as any).antenna_solutions !== undefined;
    const referenceBranchCurrents = isSweepMode && isMultiAntenna && (referenceResult as any).antenna_solutions?.length
      ? (referenceResult as any).antenna_solutions[0].branch_currents
      : (referenceResult as any).branch_currents;

    const response: {
      directivity?: any;
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

    // Initialize progress tracking for all work to be done
    const totalWork = fieldsToCompute.length + (directivityNeedsComputing ? 1 : 0);
    let completedWork = 0;
    dispatch(updatePostprocessingProgress({ completed: 0, total: totalWork }));

    // Compute directivity if requested
    if (directivityNeedsComputing) {
      const pattern = await dispatch(computeRadiationPattern()).unwrap();
      response.directivity = pattern;

      // Mark as completed
      completedWork++;
      dispatch(updateFieldResult({
        fieldId: 'directivity',
        computed: true,
        num_points: 0, // Will be updated when implemented
      }));
      dispatch(updatePostprocessingProgress({ completed: completedWork, total: totalWork }));
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

        nodeOffset += mesh.nodes.length;
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

      // Compute fields for each requested region
      const fieldResults = [];

      for (const field of fieldsToCompute) {
        // Generate observation points based on field definition
        const observation_points = generateObservationPoints(field);

        // Validate mesh data (radii already combined above)
        if (!mesh.radii || mesh.radii.length === 0) {
          return rejectWithValue('Unable to determine edge radii for field computation');
        }

        // Prepare branch currents for all frequencies
        // Results can be in different formats:
        // 1. Single antenna: results.branch_currents (array)
        // 2. Multi-antenna single freq: results.antenna_solutions[].branch_currents
        // 3. Frequency sweep: frequencySweep.results[].antenna_solutions[].branch_currents
        let branch_currents_array;
        const multiAntennaResults = (results as any)?.antenna_solutions;

        console.log('[Postprocessing] Branch currents check:', {
          isSweepMode,
          hasFrequencySweep: !!frequencySweep,
          sweepResultsCount: frequencySweep?.results?.length,
          hasResults: !!results,
          hasBranchCurrents: results ? !!results.branch_currents : false,
          hasAntennaSolutions: !!multiAntennaResults,
          antennaSolutionsCount: multiAntennaResults?.length,
        });

        if (isSweepMode && frequencySweep && frequencySweep.results && frequencySweep.results.length > 0) {
          // For sweep: combine branch currents from all antennas at each frequency
          branch_currents_array = frequencySweep.results.map(result => {
            if (result.antenna_solutions && result.antenna_solutions.length > 0) {
              // Concatenate currents from all antennas
              return result.antenna_solutions.flatMap((sol: any) => sol.branch_currents || []);
            }
            return [];
          });
        } else if (results && results.branch_currents) {
          // For single antenna, single frequency
          branch_currents_array = [results.branch_currents];
        } else if (multiAntennaResults && multiAntennaResults.length > 0) {
          // For multi-antenna, single frequency: combine currents from all antennas
          const combinedCurrents = multiAntennaResults.flatMap((sol: any) => sol.branch_currents || []);
          branch_currents_array = [combinedCurrents];
        } else {
          console.error('[Postprocessing] No branch currents! results =', results);
          return rejectWithValue('No branch currents available for field computation');
        }

        // Call postprocessor API
        const fieldRequest = {
          frequencies: frequencies,
          branch_currents: branch_currents_array,
          nodes: mesh.nodes,
          edges: mesh.edges,
          radii: mesh.radii,
          observation_points,
        };

        // Pre-flight estimate: warn if computation may timeout
        const estEvals = observation_points.length * 19 * frequencies.length * mesh.edges.length;
        const estSec = estEvals * 5e-7;
        console.log(
          `[Postprocessing] Field "${field.name}": ${observation_points.length} pts × ${mesh.edges.length} edges → est. ${estSec.toFixed(1)}s`
        );
        if (estSec > 250) {
          console.warn(
            `[Postprocessing] ⚠️ Field "${field.name}" estimated at ${estSec.toFixed(0)}s — may exceed Lambda 300s timeout!`
          );
        }

        const fieldData = await computeNearField(fieldRequest);

        // Store field data for all frequencies
        for (let freqIdx = 0; freqIdx < frequencies.length; freqIdx++) {
          const freqHz = frequencies[freqIdx];

          // Note: Backend currently returns data for first frequency only
          // In future, backend should return array of results for each frequency
          // For now, we store the same data for all frequencies
          // TODO: Update when backend supports multi-frequency field computation

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
        }

        // Update field result immediately
        completedWork++;
        dispatch(updateFieldResult({
          fieldId: field.id,
          computed: true,
          num_points: fieldData.num_points,
        }));
        dispatch(updatePostprocessingProgress({ completed: completedWork, total: totalWork }));

        fieldResults.push({
          fieldId: field.id,
          computed: true,
          num_points: fieldData.num_points,
          E_magnitudes: fieldData.E_magnitudes,
          H_magnitudes: fieldData.H_magnitudes,
          // Note: Full field vectors stored in fieldData but not included in summary
          // In production, would upload large arrays to S3/MinIO and return URL
        });
      }

      response.fields = fieldResults;
    }

    // Check total field data size and warn if > 50 MB
    const totalFieldDataSizeMB = calculateFieldDataSize(getState().solver.fieldData);
    if (totalFieldDataSizeMB > 50) {
      console.warn(`⚠️ Large field dataset: ${totalFieldDataSizeMB.toFixed(1)} MB stored in memory`);
      console.warn('Consider reducing sampling resolution or exporting to ParaView for large datasets');
      // Note: Snackbar notification will be shown in the UI (handled by fulfilled case)
    }

    // Update workflow state
    dispatch(setSolverState('postprocessing-ready'));

    return { ...response, totalFieldDataSizeMB };
  } catch (error: any) {
    return rejectWithValue(error.message || 'Postprocessing failed');
  }
});

/**
 * Compute radiation pattern from solver results
 */
export const computeRadiationPattern = createAsyncThunk<
  {
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
  },
  void,
  { state: RootState }
>('solver/computeRadiationPattern', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState();
    const { results, frequencySweep, currentFrequency } = state.solver;
    const { elements } = state.design;

    // Check for either single solve results or sweep results
    const isSweepMode = frequencySweep && frequencySweep.frequencies && frequencySweep.frequencies.length > 1;
    const hasResults = results || (isSweepMode && frequencySweep.results && frequencySweep.results.length > 0);

    if (!hasResults || !elements || elements.length === 0) {
      return rejectWithValue('No solver results or mesh data available');
    }

    // Get directivity discretization settings
    const { directivitySettings } = state.solver;

    // Determine frequencies and branch currents
    const frequencies = isSweepMode ? frequencySweep.frequencies : (currentFrequency ? [currentFrequency * 1e6] : [results!.frequency]);

    // Check if results is multi-antenna format
    const isMultiAntenna = (results as any)?.antenna_solutions !== undefined;

    // For multi-antenna: combine all meshes into one (concatenate nodes/edges/radii)
    let combinedNodes: number[][] = [];
    let combinedEdges: number[][] = [];
    let combinedRadii: number[] = [];
    let combinedBranchCurrents: any[] = [];

    if (isMultiAntenna) {
      const antenna_solutions = (results as any).antenna_solutions;

      let nodeOffset = 0;
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (!element.mesh) {
          continue;
        }

        const mesh = element.mesh;

        // Add nodes (with position offset already applied)
        const offsetNodes = mesh.nodes.map(node => [
          node[0] + element.position[0],
          node[1] + element.position[1],
          node[2] + element.position[2]
        ]);
        combinedNodes.push(...offsetNodes);

        // Add edges (adjusting indices by nodeOffset)
        const offsetEdges = mesh.edges.map(edge => [
          edge[0] + nodeOffset,
          edge[1] + nodeOffset
        ]);
        combinedEdges.push(...offsetEdges);

        // Add radii
        combinedRadii.push(...mesh.radii);

        // Add branch currents from corresponding antenna solution
        if (antenna_solutions[i]) {
          combinedBranchCurrents.push(...antenna_solutions[i].branch_currents);
        }

        nodeOffset += mesh.nodes.length;
      }
    } else {
      // Single antenna: use first element's mesh
      const element = elements[0];
      if (!element.mesh) {
        return rejectWithValue('No mesh data available');
      }

      const mesh = element.mesh;
      combinedNodes = mesh.nodes;
      combinedEdges = mesh.edges;
      combinedRadii = mesh.radii;
      combinedBranchCurrents = results!.branch_currents;
    }

    // For sweep, extract branch_currents from antenna_solutions[0] in each result
    // For single solve, use the combined branch currents
    const branch_currents_array = isSweepMode
      ? frequencySweep.results.map(r => r.antenna_solutions?.[0]?.branch_currents || [])
      : [combinedBranchCurrents];

    // Prepare request for far-field computation
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
    const errorMessage = error.response?.data?.detail || error.message || 'Far-field computation failed';
    return rejectWithValue(errorMessage);
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

    setCurrentFrequency: (state, action: PayloadAction<number>) => {
      state.currentFrequency = action.payload;
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
      state.frequencySweep = null;
      state.fieldResults = null;
      state.fieldData = null;
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
    builder.addCase(computeRadiationPattern.pending, (state) => {
      // No-op: progress tracked by parent workflow
    });

    builder.addCase(computeRadiationPattern.fulfilled, (state, action) => {
      state.radiationPattern = action.payload;
    });

    builder.addCase(computeRadiationPattern.rejected, (state, action) => {
      state.radiationPattern = null;
    });

    // ========================================================================
    // Frequency Sweep
    // ========================================================================
    builder.addCase(runFrequencySweep.pending, (state) => {
      state.sweepInProgress = true;
      state.status = 'running';
      state.progress = 0;
      state.error = null;
      state.frequencySweep = null;

      // Clear old results when new sweep starts
      state.results = null;
      state.currentDistribution = null;
      state.radiationPattern = null;
      state.multiAntennaResults = null;
      state.fieldResults = null;
      state.fieldData = null;
      state.resultsStale = false; // New results incoming
    });

    builder.addCase(runFrequencySweep.fulfilled, (state, action) => {
      state.sweepInProgress = false;
      state.status = 'completed';
      state.progress = 100;
      state.frequencySweep = action.payload;
      state.solverState = 'solved'; // Enable postprocessing after sweep
      state.resultsStale = false; // Fresh results, not stale
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

    builder.addCase(solveSingleFrequencyWorkflow.fulfilled, (state, action) => {
      state.status = 'completed';
      state.progress = 100;
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
      (state, action) => {
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
  setCurrentFrequency,
  updateFieldResult,
  updatePostprocessingProgress,
  cancelPostprocessing,
  setFieldData,
  clearFieldData,
  clearFieldDataForField,
  markResultsStale,
  clearResultsStaleFlag,
} = solverSlice.actions;

// Selectors
export const selectSolverStatus = (state: RootState) => state.solver.status;
export const selectSolverProgress = (state: RootState) => state.solver.progress;
export const selectSolverError = (state: RootState) => state.solver.error;
export const selectSolverResults = (state: RootState) => state.solver.results;
export const selectCurrentDistribution = (state: RootState) => state.solver.currentDistribution;
export const selectResultsHistory = (state: RootState) => state.solver.resultsHistory;
export const selectFrequencySweep = (state: RootState) => state.solver.frequencySweep;
export const selectSweepInProgress = (state: RootState) => state.solver.sweepInProgress;
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

export default solverSlice.reducer;
