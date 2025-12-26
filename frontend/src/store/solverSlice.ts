/**
 * Solver Redux Slice
 * Manages simulation execution, progress tracking, and results
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { SolverRequest, SolverResult, Mesh, Source } from '@/types/models';
import { solveSingle, solveAsync, getJobStatus, cancelJob } from '@/api/solver';

// ============================================================================
// Types
// ============================================================================

export type SimulationStatus = 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled';

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
  
  // History
  resultsHistory: Array<{
    timestamp: string;
    frequency: number;
    result: SolverResult;
  }>;
}

const initialState: SolverState = {
  status: 'idle',
  progress: 0,
  error: null,
  jobId: null,
  currentRequest: null,
  results: null,
  currentDistribution: null,
  resultsHistory: [],
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
      source_amplitude: source.amplitude,
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
      source_amplitude: source.amplitude,
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
      state.error = null;
      state.progress = 0;
      state.status = 'idle';
    },

    // Reset solver state
    resetSolver: () => initialState,
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
  },
});

// ============================================================================
// Exports
// ============================================================================

export const { setJobId, setProgress, clearResults, resetSolver } = solverSlice.actions;

// Selectors
export const selectSolverStatus = (state: RootState) => state.solver.status;
export const selectSolverProgress = (state: RootState) => state.solver.progress;
export const selectSolverError = (state: RootState) => state.solver.error;
export const selectSolverResults = (state: RootState) => state.solver.results;
export const selectCurrentDistribution = (state: RootState) => state.solver.currentDistribution;
export const selectResultsHistory = (state: RootState) => state.solver.resultsHistory;

export default solverSlice.reducer;
