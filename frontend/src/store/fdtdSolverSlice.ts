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
import {
  createView,
  addItemToView,
} from '@/store/fdtdPostprocessingSlice'

// ============================================================================
// Types
// ============================================================================

export type FdtdSimulationStatus =
  | 'idle'
  | 'validating'
  | 'solving'
  | 'postprocessing'
  | 'completed'
  | 'failed'

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

/**
 * Auto-postprocessing pipeline — runs after solve completes.
 *
 * 1. Extract primary field snapshot (Ez for TM, Hz for TE)
 * 2. Compute Poynting vector
 * 3. Fetch S-params if ≥2 probes
 * 4. Fetch frequency fields for each DFT frequency
 * 5. Create a default postprocessing view with relevant plots
 */
export const autoPostprocess = createAsyncThunk(
  'fdtdSolver/autoPostprocess',
  async (
    params: {
      dimensionality: '1d' | '2d'
      cellSize: [number, number, number]
      mode: 'tm' | 'te'
      probeCount: number
      dftFrequencies: number[]
    },
    { dispatch, getState },
  ) => {
    const state = (getState() as { fdtdSolver: FdtdSolverState }).fdtdSolver
    if (!state.results) return

    const dx = params.cellSize[0]
    const dy = params.dimensionality === '2d' ? params.cellSize[1] : undefined
    const primaryField = params.mode === 'te' ? 'Hz' : 'Ez'

    // 1. Extract primary field
    if (state.results.fields_final[primaryField]) {
      await dispatch(extractFdtdField({ fieldComponent: primaryField, dx, dy })).unwrap()
    }

    // 2. Compute Poynting vector (2D only, needs both E and H)
    if (params.dimensionality === '2d') {
      try {
        await dispatch(computeFdtdPoynting({ dx, dy })).unwrap()
      } catch {
        // Non-critical — continue pipeline
      }
    }

    // 3. Create default postprocessing view with relevant plots
    dispatch(createView({ name: 'Auto Results' }))
    const postState = (getState() as { fdtdPostprocessing: { selectedViewId: string | null } })
      .fdtdPostprocessing
    const viewId = postState.selectedViewId
    if (viewId) {
      // Always add probe time series if probes exist
      if (params.probeCount > 0) {
        dispatch(addItemToView({ viewId, type: 'probe_time_series' }))
      }

      // Add field heatmap for 2D
      if (params.dimensionality === '2d') {
        dispatch(addItemToView({ viewId, type: 'field_heatmap' }))
      }

      // Add S-params placeholder if ≥2 probes
      if (params.probeCount >= 2) {
        dispatch(addItemToView({ viewId, type: 's_parameters' }))
      }

      // Add frequency field placeholder if DFT was configured
      if (params.dftFrequencies.length > 0) {
        dispatch(addItemToView({ viewId, type: 'frequency_field' }))
      }
    }
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
    loadFdtdSolverState(
      state,
      action: PayloadAction<{
        results?: FdtdSolveResponse | null
        fieldSnapshot?: FieldSnapshotResponse | null
        poynting?: PoyntingResponse | null
        mode?: FdtdMode
        status?: FdtdSimulationStatus
      }>,
    ) {
      const d = action.payload
      if (d.results !== undefined) state.results = d.results
      if (d.fieldSnapshot !== undefined) state.fieldSnapshot = d.fieldSnapshot
      if (d.poynting !== undefined) state.poynting = d.poynting
      if (d.mode) state.mode = d.mode
      if (d.status) state.status = d.status
      state.error = null
      state.progress = d.results ? 100 : 0
    },
  },
  extraReducers: (builder) => {
    // Solve
    builder
      .addCase(runFdtdSimulation.pending, (state) => {
        state.status = 'solving'
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

    // Auto-postprocessing
    builder
      .addCase(autoPostprocess.pending, (state) => {
        state.status = 'postprocessing'
      })
      .addCase(autoPostprocess.fulfilled, (state) => {
        state.status = 'completed'
      })
      .addCase(autoPostprocess.rejected, (state) => {
        // Still mark as completed — solve succeeded, only postprocessing had issues
        state.status = 'completed'
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

export const { setMode, setProgress, clearResults, loadFdtdSolverState } = fdtdSolverSlice.actions

export default fdtdSolverSlice.reducer
