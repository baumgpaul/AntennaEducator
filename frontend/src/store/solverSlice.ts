/**
 * Solver Redux Slice
 * Manages simulation execution, progress tracking, and results
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { SolverRequest, SolverResult, Mesh, Source } from '@/types/models';
import type { MultiAntennaRequest, MultiAntennaSolutionResponse, FrequencySweepParams, FrequencySweepResult } from '@/types/api';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import { solveSingle, solveAsync, getJobStatus, cancelJob, solveMultiAntenna } from '@/api/solver';
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
  jobId: string | null;
  
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
  jobId: null,
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
 * Run a single frequency simulation
 */
export const runSimulation = createAsyncThunk<
  SolverResult,
  {
    mesh: Mesh;
    frequency: number;
    source: Source;
    projectId?: string;
  },
  { state: RootState }
>('solver/runSimulation', async ({ mesh, frequency, source, projectId = 'default' }, { rejectWithValue }) => {
  try {
    // Prepare solver request
    const request: SolverRequest = {
      project_id: projectId,
      frequency,
      nodes: mesh.nodes,
      edges: mesh.edges,
      radii: mesh.radii,
      source_node_start: source.node_start,
      source_node_end: source.node_end,
      source_type: source.type,
      source_amplitude: typeof source.amplitude === 'object' && 'real' in source.amplitude 
        ? source.amplitude 
        : { real: typeof source.amplitude === 'number' ? source.amplitude : parseFloat(source.amplitude as string), imag: 0 },
    };

    console.log('Running simulation:', { frequency, sourceNodes: [source.node_start, source.node_end] });

    // Call solver API
    const result = await solveSingle(request);

    console.log('Simulation complete:', { converged: result.converged, iterations: result.iterations });

    return result;
  } catch (error: any) {
    console.error('Simulation failed:', error);
    return rejectWithValue(error.message || 'Simulation failed');
  }
});

/**
 * Run async simulation with progress tracking
 */
export const runAsyncSimulation = createAsyncThunk<
  SolverResult,
  {
    mesh: Mesh;
    frequency: number;
    source: Source;
    projectId?: string;
  },
  { state: RootState }
>('solver/runAsyncSimulation', async ({ mesh, frequency, source, projectId = 'default' }, { dispatch, rejectWithValue }) => {
  try {
    // Prepare solver request
    const request: SolverRequest = {
      project_id: projectId,
      frequency,
      nodes: mesh.nodes,
      edges: mesh.edges,
      radii: mesh.radii,
      source_node_start: source.node_start,
      source_node_end: source.node_end,
      source_type: source.type,
      source_amplitude: typeof source.amplitude === 'object' && 'real' in source.amplitude 
        ? source.amplitude 
        : { real: typeof source.amplitude === 'number' ? source.amplitude : parseFloat(source.amplitude as string), imag: 0 },
    };

    console.log('Starting async simulation:', { frequency });

    // Start async job
    const { job_id } = await solveAsync(request);
    dispatch(setJobId(job_id));

    // Poll for status
    let status = 'running';
    let result: SolverResult | null = null;

    while (status === 'running' || status === 'pending') {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Poll every 1 second
      
      const jobStatus = await getJobStatus(job_id);
      status = jobStatus.status;
      
      if (jobStatus.progress !== undefined) {
        dispatch(setProgress(jobStatus.progress));
      }
      
      if (jobStatus.result) {
        result = jobStatus.result;
      }
    }

    if (status === 'completed' && result) {
      console.log('Async simulation complete');
      return result;
    } else {
      throw new Error(`Simulation ${status}`);
    }
  } catch (error: any) {
    console.error('Async simulation failed:', error);
    return rejectWithValue(error.message || 'Async simulation failed');
  }
});

/**
 * Cancel running simulation
 */
export const cancelSimulation = createAsyncThunk<void, void, { state: RootState }>(
  'solver/cancelSimulation',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { jobId } = getState().solver;
      if (jobId) {
        await cancelJob(jobId);
        console.log('Simulation cancelled:', jobId);
      }
    } catch (error: any) {
      console.error('Failed to cancel simulation:', error);
      return rejectWithValue(error.message || 'Failed to cancel simulation');
    }
  }
);

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
    console.log('Running multi-antenna simulation:', {
      frequency: request.frequency,
      antennaCount: request.antennas.length,
      totalNodes: request.antennas.reduce((sum, ant) => sum + ant.nodes.length, 0),
      totalEdges: request.antennas.reduce((sum, ant) => sum + ant.edges.length, 0),
    });
    
    console.log('Full request payload:', JSON.stringify(request, null, 2));

    const result = await solveMultiAntenna(request);

    console.log('Multi-antenna simulation complete:', {
      converged: result.converged,
      antennas: result.antenna_solutions.length,
      solveTime: result.solve_time,
    });

    return result;
  } catch (error: any) {
    console.error('Multi-antenna simulation failed:', error);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    
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

    console.log('Starting frequency sweep:', {
      start: startFrequency / 1e6 + ' MHz',
      stop: stopFrequency / 1e6 + ' MHz',
      points: numPoints,
      spacing,
    });

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

    console.log('Generated frequencies:', frequencies.map(f => (f / 1e6).toFixed(2) + ' MHz'));

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

      console.log(`Solving frequency ${i + 1}/${frequencies.length}: ${(frequency / 1e6).toFixed(2)} MHz`);

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

      console.log(`Frequency ${(frequency / 1e6).toFixed(2)} MHz solved:`, {
        converged: result.converged,
        numAntennas: result.antenna_solutions.length,
        solveTime: result.solve_time + 's',
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

    console.log('Frequency sweep complete:', {
      numFrequencies: frequencies.length,
      allConverged: results.every(r => r.converged),
    });

    return sweepResult;
  } catch (error: any) {
    console.error('Frequency sweep failed:', error);
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

    console.log('Solving at frequency:', frequencyMHz, 'MHz');

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
          node_start: s.node_start,
          node_end: s.node_end,
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

    console.log('Solver workflow complete:', {
      frequency: frequencyMHz,
      converged: result.converged,
      solutions: result.antenna_solutions.length,
    });

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
    console.error('Single frequency solve workflow failed:', error);
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
    const { results, directivityRequested, requestedFields, frequencySweep, currentFrequency } = state.solver;
    const { elements } = state.design;

    // Check for either single solve results or sweep results
    const isSweepMode = frequencySweep && frequencySweep.frequencies && frequencySweep.frequencies.length > 1;
    const hasResults = results || (isSweepMode && frequencySweep.results && frequencySweep.results.length > 0);
    
    console.log('Postprocessing workflow - state check:', {
      hasFrequencySweep: !!frequencySweep,
      hasFrequencies: !!(frequencySweep?.frequencies),
      frequenciesLength: frequencySweep?.frequencies?.length,
      hasSingleResults: !!results,
      hasSweepResults: !!(frequencySweep?.results),
      sweepResultsLength: frequencySweep?.results?.length,
      isSweepMode,
      hasAnyResults: hasResults,
    });
    
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
    const referenceBranchCurrents = isSweepMode && referenceResult.antenna_solutions?.length 
      ? referenceResult.antenna_solutions[0].branch_currents 
      : (referenceResult as any).branch_currents;
    
    console.log('Postprocessing workflow - frequency mode:', {
      isSweepMode,
      numFrequencies: frequencies.length,
      frequencies: frequencies.slice(0, 3), // Show first 3
      hasReferenceResult: !!referenceResult,
      hasAntennaSolutions: !!(referenceResult.antenna_solutions),
      numAntennaSolutions: referenceResult.antenna_solutions?.length,
      hasBranchCurrents: !!referenceBranchCurrents,
    });

    const response: {
      directivity?: any;
      fields?: Array<{ fieldId: string; computed: boolean; dataUrl?: string }>;
      message: string;
    } = { message: 'Postprocessing complete' };

    // Check what needs computing (incremental computation)
    const existingFieldResults = getState().solver.fieldResults || {};
    const fieldsToCompute = requestedFields.filter(field => !existingFieldResults[field.id]?.computed);
    const directivityNeedsComputing = directivityRequested && !existingFieldResults['directivity']?.computed;
    
    console.log('Postprocessing check:', {
      totalFieldsRequested: requestedFields.length,
      fieldsAlreadyComputed: requestedFields.length - fieldsToCompute.length,
      fieldsToCompute: fieldsToCompute.length,
      directivityRequested,
      directivityAlreadyComputed: existingFieldResults['directivity']?.computed,
      directivityNeedsComputing,
    });
    
    if (fieldsToCompute.length === 0 && !directivityNeedsComputing) {
      console.log('All requested fields already computed, nothing to do');
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
      console.log('Computing directivity...');
      const pattern = await dispatch(computeRadiationPattern()).unwrap();
      response.directivity = pattern;
      console.log('Directivity computed:', pattern.directivity, 'dBi');
      
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
      console.log(`Computing ${fieldsToCompute.length} new fields (${requestedFields.length - fieldsToCompute.length} already computed)`);
      
      // Get mesh data
      const element = elements[0];
      if (!element.mesh) {
        return rejectWithValue('No mesh data available for field computation');
      }

      const mesh = element.mesh;
      
      // Ensure radii exists - if not, create from element edges or use default
      let radii = mesh.radii;
      if (!radii || radii.length === 0) {
        console.warn('Mesh missing radii, using default 0.001m for all edges');
        radii = mesh.edges.map(() => 0.001); // Default 1mm radius
      }
      
      console.log('Mesh data for field computation:', {
        nodes: mesh.nodes.length,
        edges: mesh.edges.length,
        radii: radii.length,
      });
      
      // Compute fields for each requested region
      const fieldResults = [];
      
      for (const field of fieldsToCompute) {
        console.log(`Computing field region: ${field.id} (${field.type} ${field.shape})`);
        
        // Generate observation points based on field definition
        const observation_points = generateObservationPoints(field);
        console.log(`  Generated ${observation_points.length} observation points`);
        
        // Validate mesh data
        if (!radii || radii.length === 0) {
          console.error('Missing radii after fallback:', { radii, mesh });
          return rejectWithValue('Unable to determine edge radii for field computation');
        }
        
        console.log('Field computation request data:', {
          numFrequencies: frequencies.length,
          firstFrequency: frequencies[0],
          branch_currents_length: referenceBranchCurrents?.length,
          nodes_length: mesh.nodes.length,
          edges_length: mesh.edges.length,
          radii_length: radii.length,
          observation_points_length: observation_points.length,
        });
        
        // Prepare branch currents for all frequencies
        let branch_currents_array;
        if (isSweepMode && frequencySweep && frequencySweep.results && frequencySweep.results.length > 0) {
          // For sweep: get branch currents from each frequency's antenna_solutions
          // MultiAntennaSolutionResponse has antenna_solutions[], we use first antenna for now
          branch_currents_array = frequencySweep.results.map(result => {
            if (result.antenna_solutions && result.antenna_solutions.length > 0) {
              return result.antenna_solutions[0].branch_currents;
            }
            return [];
          });
          console.log(`Using sweep mode: ${branch_currents_array.length} frequencies, first array length: ${branch_currents_array[0]?.length}`);
        } else if (results && results.branch_currents) {
          // For single frequency: use current results
          branch_currents_array = [results.branch_currents];
          console.log(`Using single frequency mode, branch_currents length: ${results.branch_currents.length}`);
        } else {
          console.error('No branch currents available:', { 
            isSweepMode, 
            hasFrequencySweep: !!frequencySweep,
            hasSweepResults: !!(frequencySweep?.results),
            hasResults: !!results,
            hasBranchCurrents: !!(results?.branch_currents),
            firstSweepResultHasAntennaSolutions: !!(frequencySweep?.results?.[0]?.antenna_solutions)
          });
          return rejectWithValue('No branch currents available for field computation');
        }
        
        // Call postprocessor API
        const fieldRequest = {
          frequencies: frequencies,
          branch_currents: branch_currents_array,
          nodes: mesh.nodes,
          edges: mesh.edges,
          radii: radii,
          observation_points,
        };
        
        console.log('Calling computeNearField with request:', {
          num_frequencies: fieldRequest.frequencies.length,
          num_branch_current_sets: fieldRequest.branch_currents.length,
          branch_currents: `[${fieldRequest.branch_currents.length} frequencies]`,
          nodes: `[${fieldRequest.nodes.length} nodes]`,
        });
        
        // Debug: Log first few branch currents to check format
        console.log('Sample branch_currents:', {
          first_frequency_length: fieldRequest.branch_currents[0]?.length,
          first_3_currents: fieldRequest.branch_currents[0]?.slice(0, 3),
        });
        
        const fieldData = await computeNearField(fieldRequest);
        console.log(`  Field computation complete: ${fieldData.num_points} points computed`);
        
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
        
        console.log(`  Field data stored for ${frequencies.length} frequencies`);
        
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

    console.log('Postprocessing workflow complete:', response);
    return { ...response, totalFieldDataSizeMB };
  } catch (error: any) {
    console.error('Postprocessing workflow failed:', error);
    
    // Log detailed validation errors from FastAPI
    if (error.response?.data?.detail) {
      console.error('Backend validation errors:', JSON.stringify(error.response.data.detail, null, 2));
    }
    
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

    // Get mesh data from first element (for now)
    const element = elements[0];
    if (!element.mesh) {
      return rejectWithValue('No mesh data available');
    }

    const mesh = element.mesh;

    // Get directivity discretization settings
    const { directivitySettings } = state.solver;

    // Determine frequencies and branch currents
    const frequencies = isSweepMode ? frequencySweep.frequencies : (currentFrequency ? [currentFrequency * 1e6] : [results!.frequency]);
    // For sweep, extract branch_currents from antenna_solutions[0] in each result
    const branch_currents_array = isSweepMode 
      ? frequencySweep.results.map(r => r.antenna_solutions?.[0]?.branch_currents || [])
      : [results!.branch_currents];

    // Prepare request for far-field computation
    const request = {
      frequencies: frequencies,
      branch_currents: branch_currents_array,
      nodes: mesh.nodes,
      edges: mesh.edges,
      radii: mesh.radii,
      theta_points: directivitySettings.theta_points,
      phi_points: directivitySettings.phi_points,
    };

    console.log('Computing far-field radiation pattern:', {
      isSweepMode,
      numFrequencies: frequencies.length,
      firstFrequency: frequencies[0],
      nodes: mesh.nodes.length,
      edges: mesh.edges.length,
      branch_currents_arrays: branch_currents_array.length,
      first_array_length: branch_currents_array[0]?.length,
    });

    const pattern = await computeFarField(request);

    console.log('Far-field computation complete:', {
      directivity: pattern.directivity,
      gain: pattern.gain,
      efficiency: pattern.efficiency,
      theta_points: pattern.theta_angles.length,
      phi_points: pattern.phi_angles.length,
    });

    return pattern;
  } catch (error: any) {
    console.error('Far-field computation failed:', error);
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
    // Set job ID for async operations
    setJobId: (state, action: PayloadAction<string>) => {
      state.jobId = action.payload;
    },

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
      }
    },
    
    clearFieldRegions: (state) => {
      state.requestedFields = [];
    },
    
    setFieldDefinitions: (state, action: PayloadAction<FieldDefinition[]>) => {
      state.requestedFields = action.payload;
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
    // Run Simulation
    // ========================================================================
    builder.addCase(runSimulation.pending, (state, action) => {
      state.status = 'preparing';
      state.progress = 0;
      state.error = null;
      state.currentRequest = action.meta.arg as any; // Store request parameters
    });

    builder.addCase(runSimulation.fulfilled, (state, action) => {
      state.status = 'completed';
      state.progress = 100;
      state.results = action.payload;
      
      console.log('Solver response received:', {
        frequency: action.payload.frequency,
        input_impedance: action.payload.input_impedance,
        branch_currents_length: action.payload.branch_currents?.length,
        branch_currents_sample: action.payload.branch_currents?.slice(0, 3),
        input_current: action.payload.input_current
      });
      
      // Calculate current magnitude for visualization
      state.currentDistribution = action.payload.branch_currents.map((current) => {
        const parsed = parseComplex(current);
        const magnitude = Math.sqrt(parsed.real * parsed.real + parsed.imag * parsed.imag);
        return magnitude;
      });

      console.log('Current distribution computed:', {
        length: state.currentDistribution?.length,
        sample: state.currentDistribution?.slice(0, 5),
        min: Math.min(...state.currentDistribution.filter(c => isFinite(c))),
        max: Math.max(...state.currentDistribution.filter(c => isFinite(c))),
        hasNaN: state.currentDistribution.some(c => !isFinite(c))
      });

      // Add to history
      state.resultsHistory.push({
        timestamp: new Date().toISOString(),
        frequency: action.payload.frequency,
        result: action.payload,
      });

      // Keep only last 10 results in history
      if (state.resultsHistory.length > 10) {
        state.resultsHistory.shift();
      }

      console.log('Results stored, current distribution length:', state.currentDistribution?.length);
    });

    builder.addCase(runSimulation.rejected, (state, action) => {
      state.status = 'failed';
      state.error = action.payload as string || 'Simulation failed';
      state.progress = 0;
      console.error('Simulation rejected:', state.error);
    });

    // ========================================================================
    // Run Async Simulation
    // ========================================================================
    builder.addCase(runAsyncSimulation.pending, (state) => {
      state.status = 'preparing';
      state.progress = 0;
      state.error = null;
    });

    builder.addCase(runAsyncSimulation.fulfilled, (state, action) => {
      state.status = 'completed';
      state.progress = 100;
      state.results = action.payload;
      
      // Calculate current magnitude for visualization
      state.currentDistribution = action.payload.branch_currents.map((current) => {
        const real = current.real || current[0];
        const imag = current.imag || current[1];
        return Math.sqrt(real * real + imag * imag);
      });

      // Add to history
      state.resultsHistory.push({
        timestamp: new Date().toISOString(),
        frequency: action.payload.frequency,
        result: action.payload,
      });

      if (state.resultsHistory.length > 10) {
        state.resultsHistory.shift();
      }
    });

    builder.addCase(runAsyncSimulation.rejected, (state, action) => {
      state.status = 'failed';
      state.error = action.payload as string || 'Async simulation failed';
      state.progress = 0;
    });

    // ========================================================================
    // Cancel Simulation
    // ========================================================================
    builder.addCase(cancelSimulation.fulfilled, (state) => {
      state.status = 'cancelled';
      state.progress = 0;
      state.jobId = null;
    });

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
      console.log('Multi-antenna solver response:', {
        converged: action.payload.converged,
        num_solutions: action.payload.antenna_solutions.length,
        frequency: action.payload.frequency,
        first_solution: action.payload.antenna_solutions[0]
      });

      if (action.payload.antenna_solutions.length === 1) {
        const solution = action.payload.antenna_solutions[0];
        
        console.log('Single antenna solution:', {
          input_impedance: solution.input_impedance,
          branch_currents_length: solution.branch_currents?.length,
          branch_currents_sample: solution.branch_currents?.slice(0, 3),
          voltage_source_currents_length: solution.voltage_source_currents?.length,
          voltage_source_currents: solution.voltage_source_currents,
          has_current_source_currents: !!solution.current_source_currents,
          has_load_currents: !!solution.load_currents
        });

        // Calculate input impedance from voltage source currents if not provided
        let inputImpedance = parseComplex(solution.input_impedance);
        
        console.log('Parsed input_impedance from backend:', inputImpedance);
        
        if ((!solution.input_impedance || (inputImpedance.real === 0 && inputImpedance.imag === 0)) 
            && solution.voltage_source_currents && solution.voltage_source_currents.length > 0) {
          console.log('Backend impedance is null/zero, calculating from voltage_source_currents...');
          
          // Sum all voltage source currents (for split sources)
          const sourceCurrents = parseComplexArray(solution.voltage_source_currents);
          console.log('Parsed voltage source currents:', sourceCurrents);
          
          const totalSourceCurrent = sourceCurrents.reduce((sum, current) => ({
            real: sum.real + current.real,
            imag: sum.imag + current.imag
          }), { real: 0, imag: 0 });
          
          console.log('Total source current (sum):', totalSourceCurrent);
          
          // Z = V / I, assuming V = 1V (normalized)
          const I_mag_sq = totalSourceCurrent.real ** 2 + totalSourceCurrent.imag ** 2;
          console.log('|I|^2:', I_mag_sq);
          
          if (I_mag_sq > 1e-20) {
            // Z = V / I = 1 / I for normalized voltage
            // 1 / (a + jb) = (a - jb) / (a^2 + b^2)
            inputImpedance = {
              real: totalSourceCurrent.real / I_mag_sq,
              imag: -totalSourceCurrent.imag / I_mag_sq
            };
            console.log('Calculated input impedance from source currents:', inputImpedance);
          } else {
            console.warn('Source current magnitude too small:', Math.sqrt(I_mag_sq));
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
        // Multiple antennas: combine all branch currents for visualization
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

      console.log('Multi-antenna results stored, distribution length:', state.currentDistribution?.length);
    });

    builder.addCase(runMultiAntennaSimulation.rejected, (state, action) => {
      state.status = 'failed';
      state.error = action.payload as string || 'Multi-antenna simulation failed';
      state.progress = 0;
      console.error('Multi-antenna simulation rejected:', state.error);
    });

    // computeRadiationPattern
    builder.addCase(computeRadiationPattern.pending, (state) => {
      console.log('Computing radiation pattern...');
    });

    builder.addCase(computeRadiationPattern.fulfilled, (state, action) => {
      state.radiationPattern = action.payload;
      console.log('Radiation pattern computed:', {
        directivity: action.payload.directivity,
        gain: action.payload.gain,
        efficiency: action.payload.efficiency,
      });
    });

    builder.addCase(computeRadiationPattern.rejected, (state, action) => {
      console.error('Radiation pattern computation failed:', action.payload);
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
      
      console.log('Frequency sweep started...');
    });

    builder.addCase(runFrequencySweep.fulfilled, (state, action) => {
      state.sweepInProgress = false;
      state.status = 'completed';
      state.progress = 100;
      state.frequencySweep = action.payload;
      state.solverState = 'solved'; // Enable postprocessing after sweep
      state.resultsStale = false; // Fresh results, not stale
      console.log('Frequency sweep completed:', {
        numFrequencies: action.payload.frequencies.length,
        allConverged: action.payload.results.every(r => r.converged),
      });
    });

    builder.addCase(runFrequencySweep.rejected, (state, action) => {
      state.sweepInProgress = false;
      state.status = 'failed';
      state.error = action.payload as string || 'Frequency sweep failed';
      state.progress = 0;
      console.error('Frequency sweep rejected:', state.error);
    });

    // ========================================================================
    // Solve Single Frequency Workflow
    // ========================================================================
    builder.addCase(solveSingleFrequencyWorkflow.pending, (state) => {
      state.status = 'running';
      state.progress = 0;
      state.error = null;
      console.log('Solve single frequency workflow started...');
    });

    builder.addCase(solveSingleFrequencyWorkflow.fulfilled, (state, action) => {
      state.status = 'completed';
      state.progress = 100;
      console.log('Solve single frequency workflow completed:', {
        frequency: action.payload.frequency,
        converged: action.payload.converged,
        impedance: action.payload.input_impedance,
      });
    });

    builder.addCase(solveSingleFrequencyWorkflow.rejected, (state, action) => {
      state.status = 'failed';
      state.error = action.payload as string || 'Solve workflow failed';
      state.progress = 0;
      state.solverState = 'idle'; // Reset workflow state on error
      console.error('Solve single frequency workflow rejected:', state.error);
    });

    // ========================================================================
    // Compute Postprocessing Workflow
    // ========================================================================
    builder.addCase(computePostprocessingWorkflow.pending, (state) => {
      state.postprocessingStatus = 'running';
      state.progress = 50; // Arbitrary progress indicator
      state.error = null;
      state.postprocessingProgress = { completed: 0, total: 0 };
      console.log('Compute postprocessing workflow started...');
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
            num_points: field.num_points,
          };
        }
      }
      
      console.log('Compute postprocessing workflow completed:', action.payload.message);
    });

    builder.addCase(computePostprocessingWorkflow.rejected, (state, action) => {
      state.postprocessingStatus = 'failed';
      state.error = action.payload as string || 'Postprocessing workflow failed';
      state.progress = 0;
      state.postprocessingProgress = null;
      console.error('Compute postprocessing workflow rejected:', state.error);
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
          console.log(`[solverSlice] Results marked stale due to: ${action.type}`);
        }
      }
    );
  },
});

// ============================================================================
// Exports
// ============================================================================

export const { 
  setJobId, 
  setProgress, 
  clearResults, 
  resetSolver,
  addFieldRegion,
  deleteFieldRegion,
  updateFieldRegion,
  clearFieldRegions,
  setFieldDefinitions,
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
export const selectRequestedFields = (state: RootState) => state.solver.requestedFields;
export const selectDirectivityRequested = (state: RootState) => state.solver.directivityRequested;
export const selectDirectivitySettings = (state: RootState) => state.solver.directivitySettings;
export const selectSolverState = (state: RootState) => state.solver.solverState;
export const selectCurrentFrequency = (state: RootState) => state.solver.currentFrequency;
export const selectFieldData = (state: RootState) => state.solver.fieldData;
export const selectResultsStale = (state: RootState) => state.solver.resultsStale;

export default solverSlice.reducer;
