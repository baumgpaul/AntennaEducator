/**
 * FDTD Design Slice
 *
 * Manages the FDTD simulation domain definition:
 * structures, sources, boundary conditions, probes, and geometry.
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'
import type {
  FdtdStructure,
  FdtdSource,
  DomainBoundaries,
  FdtdProbe,
  FdtdConfig,
  FdtdDimensionality,
  FdtdMeshResponse,
  FdtdValidationResponse,
} from '@/types/fdtd'
import { DEFAULT_BOUNDARIES, DEFAULT_CONFIG } from '@/types/fdtd'
import { generateMesh, validateSetup } from '@/api/preprocessorFdtd'

// ============================================================================
// State shape
// ============================================================================

interface FdtdDesignState {
  // Domain geometry
  dimensionality: FdtdDimensionality
  domainSize: [number, number, number]
  cellSize: [number, number, number]

  // Domain contents
  structures: FdtdStructure[]
  sources: FdtdSource[]
  boundaries: DomainBoundaries
  probes: FdtdProbe[]

  // Solver config
  config: FdtdConfig

  // Mesh / validation results (from preprocessor)
  meshInfo: FdtdMeshResponse | null
  validation: FdtdValidationResponse | null

  // Status tracking
  meshStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  meshError: string | null

  // Dirty flag — true when design changed since last solve
  isDirty: boolean
}

const initialState: FdtdDesignState = {
  dimensionality: '1d',
  domainSize: [1.0, 0.01, 0.01],
  cellSize: [0.005, 0.01, 0.01],
  structures: [],
  sources: [],
  boundaries: DEFAULT_BOUNDARIES,
  probes: [],
  config: { ...DEFAULT_CONFIG },
  meshInfo: null,
  validation: null,
  meshStatus: 'idle',
  meshError: null,
  isDirty: true,
}

// ============================================================================
// Async thunks
// ============================================================================

export const validateFdtdSetup = createAsyncThunk(
  'fdtdDesign/validateSetup',
  async (_, { getState }) => {
    const state = (getState() as { fdtdDesign: FdtdDesignState }).fdtdDesign
    const response = await validateSetup({
      geometry: {
        domain_size: state.domainSize,
        cell_size: state.cellSize,
        structures: state.structures,
        sources: state.sources,
        boundaries: state.boundaries,
        probes: state.probes,
      },
      config: state.config,
    })
    return response
  },
)

export const generateFdtdMesh = createAsyncThunk(
  'fdtdDesign/generateMesh',
  async (_, { getState }) => {
    const state = (getState() as { fdtdDesign: FdtdDesignState }).fdtdDesign
    const response = await generateMesh({
      geometry: {
        domain_size: state.domainSize,
        cell_size: state.cellSize,
        structures: state.structures,
        sources: state.sources,
        boundaries: state.boundaries,
        probes: state.probes,
      },
    })
    return response
  },
)

// ============================================================================
// Slice
// ============================================================================

const fdtdDesignSlice = createSlice({
  name: 'fdtdDesign',
  initialState,
  reducers: {
    // Domain settings
    setDimensionality(state, action: PayloadAction<FdtdDimensionality>) {
      const prev = state.dimensionality
      state.dimensionality = action.payload
      // Adjust domain/cell defaults so the grid is valid for the new mode
      if (prev === '1d' && action.payload === '2d') {
        // Ensure y-dimension has enough cells (at least 3)
        const domY = state.domainSize[1]
        const cellY = state.cellSize[1]
        if (Math.round(domY / cellY) < 3) {
          state.domainSize = [state.domainSize[0], state.domainSize[0], state.domainSize[2]]
          state.cellSize = [state.cellSize[0], state.cellSize[0], state.cellSize[2]]
        }
      }
      state.isDirty = true
    },
    setDomainSize(state, action: PayloadAction<[number, number, number]>) {
      state.domainSize = action.payload
      state.isDirty = true
    },
    setCellSize(state, action: PayloadAction<[number, number, number]>) {
      state.cellSize = action.payload
      state.isDirty = true
    },

    // Structures
    addStructure(state, action: PayloadAction<Omit<FdtdStructure, 'id'>>) {
      state.structures.push({ ...action.payload, id: uuidv4() })
      state.isDirty = true
    },
    removeStructure(state, action: PayloadAction<string>) {
      state.structures = state.structures.filter((s) => s.id !== action.payload)
      state.isDirty = true
    },
    updateStructure(state, action: PayloadAction<FdtdStructure>) {
      const idx = state.structures.findIndex((s) => s.id === action.payload.id)
      if (idx !== -1) {
        state.structures[idx] = action.payload
        state.isDirty = true
      }
    },

    // Sources
    addSource(state, action: PayloadAction<Omit<FdtdSource, 'id'>>) {
      state.sources.push({ ...action.payload, id: uuidv4() })
      state.isDirty = true
    },
    removeSource(state, action: PayloadAction<string>) {
      state.sources = state.sources.filter((s) => s.id !== action.payload)
      state.isDirty = true
    },
    updateSource(state, action: PayloadAction<FdtdSource>) {
      const idx = state.sources.findIndex((s) => s.id === action.payload.id)
      if (idx !== -1) {
        state.sources[idx] = action.payload
        state.isDirty = true
      }
    },

    // Boundaries
    setBoundaries(state, action: PayloadAction<DomainBoundaries>) {
      state.boundaries = action.payload
      state.isDirty = true
    },

    // Probes
    addProbe(state, action: PayloadAction<Omit<FdtdProbe, 'id'>>) {
      state.probes.push({ ...action.payload, id: uuidv4() })
      state.isDirty = true
    },
    removeProbe(state, action: PayloadAction<string>) {
      state.probes = state.probes.filter((p) => p.id !== action.payload)
      state.isDirty = true
    },
    updateProbe(state, action: PayloadAction<FdtdProbe>) {
      const idx = state.probes.findIndex((p) => p.id === action.payload.id)
      if (idx !== -1) {
        state.probes[idx] = action.payload
        state.isDirty = true
      }
    },

    // Config
    setConfig(state, action: PayloadAction<Partial<FdtdConfig>>) {
      state.config = { ...state.config, ...action.payload }
      state.isDirty = true
    },

    // Load full design from project persistence (auto-load on mount)
    loadFdtdDesign(
      state,
      action: PayloadAction<{
        dimensionality?: FdtdDimensionality
        domainSize?: [number, number, number]
        cellSize?: [number, number, number]
        structures?: FdtdStructure[]
        sources?: FdtdSource[]
        boundaries?: DomainBoundaries
        probes?: FdtdProbe[]
        config?: FdtdConfig
      }>,
    ) {
      const d = action.payload
      if (d.dimensionality) state.dimensionality = d.dimensionality
      if (d.domainSize) state.domainSize = d.domainSize
      if (d.cellSize) state.cellSize = d.cellSize
      if (d.structures) state.structures = d.structures
      if (d.sources) state.sources = d.sources
      if (d.boundaries) state.boundaries = d.boundaries
      if (d.probes) state.probes = d.probes
      if (d.config) state.config = { ...DEFAULT_CONFIG, ...d.config }
      state.isDirty = false
    },

    // Reset
    resetDesign() {
      return { ...initialState }
    },

    // Mark clean (after successful solve)
    markClean(state) {
      state.isDirty = false
    },
  },
  extraReducers: (builder) => {
    // Validate
    builder
      .addCase(validateFdtdSetup.fulfilled, (state, action) => {
        state.validation = action.payload
      })
    // Mesh generation
    builder
      .addCase(generateFdtdMesh.pending, (state) => {
        state.meshStatus = 'loading'
        state.meshError = null
      })
      .addCase(generateFdtdMesh.fulfilled, (state, action) => {
        state.meshStatus = 'succeeded'
        state.meshInfo = action.payload
      })
      .addCase(generateFdtdMesh.rejected, (state, action) => {
        state.meshStatus = 'failed'
        state.meshError = action.error.message ?? 'Mesh generation failed'
      })
  },
})

export const {
  setDimensionality,
  setDomainSize,
  setCellSize,
  addStructure,
  removeStructure,
  updateStructure,
  addSource,
  removeSource,
  updateSource,
  setBoundaries,
  addProbe,
  removeProbe,
  updateProbe,
  setConfig,
  loadFdtdDesign,
  resetDesign,
  markClean,
} = fdtdDesignSlice.actions

export default fdtdDesignSlice.reducer
