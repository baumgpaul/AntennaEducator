/**
 * FEM solver async thunks — orchestrate solve workflow via Redux.
 */

import { createAsyncThunk } from '@reduxjs/toolkit'
import type { RootState } from './store'
import { solveFEM } from '@/api/femSolver'
import { getFieldVisualization, getLinePlotData, getPointProbe } from '@/api/femPostprocessor'
import {
  setSolving,
  setSolveProgress,
  setSolveResult,
  setSolveError,
  setLinePlotData,
  setProbeResult,
} from './femSolverSlice'
import { clearStale } from './femDesignSlice'
import type { FEMSolverResult } from '@/types/femSolver'
import type { FieldVisualizationData } from '@/types/femResults'

/** Run the FEM solver with current design state and solver config. */
export const runFEMSolve = createAsyncThunk<
  FEMSolverResult,
  void,
  { state: RootState }
>(
  'femSolver/runSolve',
  async (_, { getState, dispatch, rejectWithValue }) => {
    const state = getState()
    const { mesh, pdeType, materials, materialAssignments, boundaryConditions, excitations } =
      state.femDesign
    const config = state.femSolver.config

    if (!mesh) {
      return rejectWithValue('No mesh available. Generate a mesh first.')
    }

    dispatch(setSolving('Submitting solve request…'))

    try {
      dispatch(setSolveProgress('Solving…'))
      const result = await solveFEM(
        mesh,
        pdeType,
        materials,
        materialAssignments,
        boundaryConditions,
        excitations,
        config,
      )

      dispatch(setSolveResult(result))
      dispatch(clearStale())
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Solve failed'
      dispatch(setSolveError(message))
      return rejectWithValue(message)
    }
  },
)

/** Fetch field visualization data for the selected field. */
export const fetchFieldVisualization = createAsyncThunk<
  FieldVisualizationData,
  string,
  { state: RootState }
>(
  'femSolver/fetchFieldViz',
  async (fieldName, { getState, rejectWithValue }) => {
    const state = getState()
    const { mesh } = state.femDesign
    const result = state.femSolver.result

    if (!mesh || !result) {
      return rejectWithValue('No mesh or result available')
    }

    try {
      return await getFieldVisualization(mesh, result, fieldName)
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to get field data')
    }
  },
)

/** Evaluate field along a line for line plot. */
export const fetchLinePlotData = createAsyncThunk<
  { id: string; data: Awaited<ReturnType<typeof getLinePlotData>> },
  {
    id: string
    fieldName: string
    startPoint: [number, number]
    endPoint: [number, number]
    nPoints: number
  },
  { state: RootState }
>(
  'femSolver/fetchLinePlot',
  async ({ id, fieldName, startPoint, endPoint, nPoints }, { getState, dispatch, rejectWithValue }) => {
    const state = getState()
    const { mesh } = state.femDesign
    const result = state.femSolver.result

    if (!mesh || !result) {
      return rejectWithValue('No mesh or result available')
    }

    try {
      const data = await getLinePlotData(mesh, result, fieldName, startPoint, endPoint, nPoints)
      dispatch(setLinePlotData({ id, data }))
      return { id, data }
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to get line plot data')
    }
  },
)

/** Evaluate field at a point probe. */
export const fetchPointProbe = createAsyncThunk<
  { id: string; result: Awaited<ReturnType<typeof getPointProbe>> },
  { id: string; x: number; y: number },
  { state: RootState }
>(
  'femSolver/fetchPointProbe',
  async ({ id, x, y }, { getState, dispatch, rejectWithValue }) => {
    const state = getState()
    const { mesh } = state.femDesign
    const solveResult = state.femSolver.result

    if (!mesh || !solveResult) {
      return rejectWithValue('No mesh or result available')
    }

    try {
      const probeResult = await getPointProbe(mesh, solveResult, x, y)
      dispatch(setProbeResult({ id, result: probeResult }))
      return { id, result: probeResult }
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to get probe data')
    }
  },
)
