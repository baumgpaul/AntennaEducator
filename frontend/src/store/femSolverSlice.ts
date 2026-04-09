/**
 * FEM Solver state slice
 * Manages solver configuration, solve status, and results.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import type {
  FEMSolverConfig,
  FEMSolverResult,
  SolveStatus,
} from '@/types/femSolver'
import type {
  DisplayMode,
  ColorMapName,
  LinePlotConfig,
  LinePlotData,
  PointProbe,
  PointProbeResult,
} from '@/types/femResults'

// ── State interface ───────────────────────────────────────────

export interface FEMSolverState {
  // Solver configuration
  config: FEMSolverConfig

  // Solve status
  solveStatus: SolveStatus
  solveProgress: string
  result: FEMSolverResult | null
  error: string | null

  // Postprocessing view
  selectedField: string | null
  displayMode: DisplayMode
  colorMap: ColorMapName
  colorRange: [number, number] | null
  showMeshOverlay: boolean
  showVectors: boolean
  vectorScale: number

  // Line plots
  linePlots: LinePlotConfig[]
  linePlotData: Record<string, LinePlotData>

  // Point probes
  probes: PointProbe[]
  probeResults: Record<string, PointProbeResult>
}

const initialState: FEMSolverState = {
  config: {
    analysisType: 'static',
    linearSolver: 'direct',
    tolerance: 1e-8,
    maxIterations: 1000,
    requestedFields: ['potential', 'e_field'],
    requestedIntegrals: ['energy'],
  },

  solveStatus: 'idle',
  solveProgress: '',
  result: null,
  error: null,

  selectedField: null,
  displayMode: 'contour',
  colorMap: 'viridis',
  colorRange: null,
  showMeshOverlay: true,
  showVectors: false,
  vectorScale: 1.0,

  linePlots: [],
  linePlotData: {},

  probes: [],
  probeResults: {},
}

// ── Slice ─────────────────────────────────────────────────────

const femSolverSlice = createSlice({
  name: 'femSolver',
  initialState,
  reducers: {
    // — Config —
    setFEMSolverConfig(
      state,
      action: PayloadAction<Partial<FEMSolverConfig>>
    ) {
      Object.assign(state.config, action.payload)
    },

    // — Solve lifecycle —
    setSolving(state, action: PayloadAction<string>) {
      state.solveStatus = 'solving'
      state.solveProgress = action.payload
      state.error = null
    },
    setSolveProgress(state, action: PayloadAction<string>) {
      state.solveProgress = action.payload
    },
    setSolveResult(state, action: PayloadAction<FEMSolverResult>) {
      state.solveStatus = 'done'
      state.result = action.payload
      state.solveProgress = ''
      // Auto-select the first scalar field
      if (
        action.payload.scalarFields.length > 0 &&
        !state.selectedField
      ) {
        state.selectedField = action.payload.scalarFields[0].name
      }
    },
    setSolveError(state, action: PayloadAction<string>) {
      state.solveStatus = 'error'
      state.error = action.payload
      state.solveProgress = ''
    },
    clearSolveResult(state) {
      state.solveStatus = 'idle'
      state.result = null
      state.error = null
      state.solveProgress = ''
      state.selectedField = null
      state.linePlotData = {}
      state.probeResults = {}
    },

    // — Postprocessing view —
    setSelectedField(state, action: PayloadAction<string | null>) {
      state.selectedField = action.payload
    },
    setDisplayMode(state, action: PayloadAction<DisplayMode>) {
      state.displayMode = action.payload
    },
    setColorMap(state, action: PayloadAction<ColorMapName>) {
      state.colorMap = action.payload
    },
    setColorRange(state, action: PayloadAction<[number, number] | null>) {
      state.colorRange = action.payload
    },
    toggleMeshOverlay(state) {
      state.showMeshOverlay = !state.showMeshOverlay
    },
    toggleVectors(state) {
      state.showVectors = !state.showVectors
    },
    setVectorScale(state, action: PayloadAction<number>) {
      state.vectorScale = action.payload
    },

    // — Line plots —
    addLinePlot(state, action: PayloadAction<LinePlotConfig>) {
      state.linePlots.push(action.payload)
    },
    removeLinePlot(state, action: PayloadAction<string>) {
      state.linePlots = state.linePlots.filter(
        (lp) => lp.id !== action.payload
      )
      delete state.linePlotData[action.payload]
    },
    setLinePlotData(
      state,
      action: PayloadAction<{ id: string; data: LinePlotData }>
    ) {
      state.linePlotData[action.payload.id] = action.payload.data
    },

    // — Point probes —
    addProbe(state, action: PayloadAction<PointProbe>) {
      state.probes.push(action.payload)
    },
    removeProbe(state, action: PayloadAction<string>) {
      state.probes = state.probes.filter((p) => p.id !== action.payload)
      delete state.probeResults[action.payload]
    },
    setProbeResult(
      state,
      action: PayloadAction<{ id: string; result: PointProbeResult }>
    ) {
      state.probeResults[action.payload.id] = action.payload.result
    },

    // — Reset —
    resetFEMSolver() {
      return initialState
    },
  },
})

// ── Exports ───────────────────────────────────────────────────

export const {
  setFEMSolverConfig,
  setSolving,
  setSolveProgress,
  setSolveResult,
  setSolveError,
  clearSolveResult,
  setSelectedField,
  setDisplayMode,
  setColorMap,
  setColorRange,
  toggleMeshOverlay,
  toggleVectors,
  setVectorScale,
  addLinePlot,
  removeLinePlot,
  setLinePlotData,
  addProbe,
  removeProbe,
  setProbeResult,
  resetFEMSolver,
} = femSolverSlice.actions

// ── Selectors ─────────────────────────────────────────────────

export const selectFEMSolverConfig = (state: RootState) =>
  state.femSolver.config
export const selectFEMSolveStatus = (state: RootState) =>
  state.femSolver.solveStatus
export const selectFEMSolveResult = (state: RootState) =>
  state.femSolver.result
export const selectFEMSelectedField = (state: RootState) =>
  state.femSolver.selectedField
export const selectFEMDisplayMode = (state: RootState) =>
  state.femSolver.displayMode

export default femSolverSlice.reducer
