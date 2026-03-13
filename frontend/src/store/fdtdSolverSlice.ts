/**
 * FDTD Solver Slice
 *
 * Manages FDTD simulation execution, progress, and results.
 * Also orchestrates postprocessor calls after solve completes.
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type {
  FdtdSolveRequest,
  FdtdSolveResponse,
  FdtdMode,
  FieldSnapshotResponse,
  PoyntingResponse,
} from '@/types/fdtd'
import { solve } from '@/api/solverFdtd'
import { extractFieldSnapshot, computePoyntingVector } from '@/api/postprocessorFdtd'

// ============================================================================
// Types
// ============================================================================

export type FdtdSimulationStatus = 'idle' | 'running' | 'completed' | 'failed'

interface FdtdSolverState {
  status: FdtdSimulationStatus
  progress: number
  error: string | null

  // Raw solver response
  results: FdtdSolveResponse | null

  // Post-processed data
  fieldSnapshot: FieldSnapshotResponse | null
  poynting: PoyntingResponse | null

  // 2-D mode selection
  mode: FdtdMode
}

const initialState: FdtdSolverState = {
  status: 'idle',
  progress: 0,
  error: null,
  results: null,
  fieldSnapshot: null,
  poynting: null,
  mode: 'tm',
}

// ============================================================================
// Async thunks
// ============================================================================

/** Run the FDTD solver with current design state. */
export const runFdtdSimulation = createAsyncThunk(
  'fdtdSolver/run',
  async (request: FdtdSolveRequest) => {
    const response = await solve(request)
    return response
  },
)

/** Extract a field snapshot from the latest solver results. */
export const extractFdtdField = createAsyncThunk(
  'fdtdSolver/extractField',
  async (
    params: { fieldComponent: string; dx: number; dy?: number },
    { getState },
  ) => {
    const state = (getState() as { fdtdSolver: FdtdSolverState }).fdtdSolver
    if (!state.results?.fields_final) {
      throw new Error('No solver results available')
    }
    const fieldData = state.results.fields_final[params.fieldComponent]
    if (!fieldData) {
      throw new Error(`Field component ${params.fieldComponent} not found in results`)
    }
    const response = await extractFieldSnapshot({
      field_component: params.fieldComponent as any,
      field_data: fieldData,
      dx: params.dx,
      dy: params.dy,
    })
    return response
  },
)

/** Compute Poynting vector from final fields. */
export const computeFdtdPoynting = createAsyncThunk(
  'fdtdSolver/computePoynting',
  async (params: { dx: number; dy?: number }, { getState }) => {
    const state = (getState() as { fdtdSolver: FdtdSolverState }).fdtdSolver
    if (!state.results?.fields_final) {
      throw new Error('No solver results available')
    }
    const finals = state.results.fields_final
    const eFields: Record<string, number[] | number[][]> = {}
    const hFields: Record<string, number[] | number[][]> = {}
    for (const [key, val] of Object.entries(finals)) {
      if (key.startsWith('E')) eFields[key] = val
      if (key.startsWith('H')) hFields[key] = val
    }
    const response = await computePoyntingVector({
      e_fields: eFields,
      h_fields: hFields,
      dx: params.dx,
      dy: params.dy,
    })
    return response
  },
)

// ============================================================================
// Slice
// ============================================================================

const fdtdSolverSlice = createSlice({
  name: 'fdtdSolver',
  initialState,
  reducers: {
    setMode(state, action: PayloadAction<FdtdMode>) {
      state.mode = action.payload
    },
    setProgress(state, action: PayloadAction<number>) {
      state.progress = action.payload
    },
    clearResults(state) {
      state.results = null
      state.fieldSnapshot = null
      state.poynting = null
      state.status = 'idle'
      state.error = null
      state.progress = 0
    },
  },
  extraReducers: (builder) => {
    // Solve
    builder
      .addCase(runFdtdSimulation.pending, (state) => {
        state.status = 'running'
        state.progress = 0
        state.error = null
        state.fieldSnapshot = null
        state.poynting = null
      })
      .addCase(runFdtdSimulation.fulfilled, (state, action) => {
        state.status = 'completed'
        state.progress = 100
        state.results = action.payload
      })
      .addCase(runFdtdSimulation.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Simulation failed'
      })

    // Field extraction
    builder
      .addCase(extractFdtdField.fulfilled, (state, action) => {
        state.fieldSnapshot = action.payload
      })

    // Poynting
    builder
      .addCase(computeFdtdPoynting.fulfilled, (state, action) => {
        state.poynting = action.payload
      })
  },
})

export const { setMode, setProgress, clearResults } = fdtdSolverSlice.actions

export default fdtdSolverSlice.reducer
