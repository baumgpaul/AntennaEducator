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
import { computeFarField } from '@/api/postprocessor';

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
  solverState: SolverWorkflowState;
  currentFrequency: number | null; // MHz - set after single frequency solve
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
  solverState: 'idle',
  currentFrequency: null,
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
    const { results } = state.solver;
    const { elements } = state.design;

    if (!results || !elements || elements.length === 0) {
      return rejectWithValue('No solver results or mesh data available');
    }

    // Get mesh data from first element (for now)
    const element = elements[0];
    if (!element.mesh) {
      return rejectWithValue('No mesh data available');
    }

    const mesh = element.mesh;

    // Prepare request for far-field computation
    const request = {
      frequencies: [results.frequency],
      branch_currents: [results.branch_currents],
      nodes: mesh.nodes,
      edges: mesh.edges,
      radii: mesh.radii,
      theta_points: 19,
      phi_points: 37,
    };

    console.log('Computing far-field radiation pattern:', {
      frequency: results.frequency,
      nodes: mesh.nodes.length,
      edges: mesh.edges.length,
      branch_currents: results.branch_currents.length,
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
    
    setDirectivityRequested: (state, action: PayloadAction<boolean>) => {
      state.directivityRequested = action.payload;
    },
    
    setSolverState: (state, action: PayloadAction<SolverWorkflowState>) => {
      state.solverState = action.payload;
    },
    
    setCurrentFrequency: (state, action: PayloadAction<number | null>) => {
      state.currentFrequency = action.payload;
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
    });

    builder.addCase(runMultiAntennaSimulation.fulfilled, (state, action) => {
      state.status = 'completed';
      state.progress = 100;
      state.multiAntennaResults = action.payload;
      
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
      console.log('Frequency sweep started...');
    });

    builder.addCase(runFrequencySweep.fulfilled, (state, action) => {
      state.sweepInProgress = false;
      state.status = 'completed';
      state.progress = 100;
      state.frequencySweep = action.payload;
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
  setDirectivityRequested,
  setSolverState,
  setCurrentFrequency,
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
export const selectSolverState = (state: RootState) => state.solver.solverState;
export const selectCurrentFrequency = (state: RootState) => state.solver.currentFrequency;

export default solverSlice.reducer;
