/**
 * Design state slice
 * Manages antenna geometry, mesh, and design workflow state
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type {
  Mesh,
  Source,
  LumpedElement,
  SolverResult,
  DipoleConfig,
  LoopConfig,
  HelixConfig,
  RodConfig,
} from '@/types/models'
import { generateDipoleMesh, generateLoopMesh } from '@/api/preprocessor'

interface DesignState {
  // Antenna configuration
  antennaType: 'dipole' | 'loop' | 'helix' | 'rod' | 'custom' | null
  antennaConfig: DipoleConfig | LoopConfig | HelixConfig | RodConfig | null
  
  // Generated mesh
  mesh: Mesh | null
  sources: Source[]
  lumpedElements: LumpedElement[]
  
  // Solver results
  results: SolverResult | null
  resultsHistory: SolverResult[]
  
  // UI state
  selectedElementId: string | null
  viewMode: '3d' | 'tree' | 'properties'
  
  // Loading states
  meshGenerating: boolean
  solving: boolean
  
  // Errors
  meshError: string | null
  solverError: string | null
}

const initialState: DesignState = {
  antennaType: null,
  antennaConfig: null,
  mesh: null,
  sources: [],
  lumpedElements: [],
  results: null,
  resultsHistory: [],
  selectedElementId: null,
  viewMode: '3d',
  meshGenerating: false,
  solving: false,
  meshError: null,
  solverError: null,
}

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Generate dipole antenna mesh
 */
export const generateDipole = createAsyncThunk(
  'design/generateDipole',
  async (
    formData: {
      name: string;
      length: number;
      radius: number;
      gap: number;
      frequency: number;
      segments: number;
      feedType: 'gap' | 'balanced';
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await generateDipoleMesh(formData);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to generate dipole mesh');
    }
  }
);

/**
 * Generate loop antenna mesh
 */
export const generateLoop = createAsyncThunk(
  'design/generateLoop',
  async (
    formData: {
      name: string;
      loopType: 'circular' | 'rectangular' | 'polygon';
      radius?: number;
      width?: number;
      height?: number;
      sides?: number;
      circumradius?: number;
      wireRadius: number;
      frequency: number;
      segments: number;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await generateLoopMesh(formData);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to generate loop mesh');
    }
  }
);

// ============================================================================
// Slice
// ============================================================================

const designSlice = createSlice({
  name: 'design',
  initialState,
  reducers: {
    // Set antenna configuration
    setAntennaType: (
      state,
      action: PayloadAction<'dipole' | 'loop' | 'helix' | 'rod' | 'custom'>
    ) => {
      state.antennaType = action.payload
    },
    
    setAntennaConfig: (
      state,
      action: PayloadAction<DipoleConfig | LoopConfig | HelixConfig | RodConfig>
    ) => {
      state.antennaConfig = action.payload
    },
    
    // Mesh generation
    meshGenerationStart: (state) => {
      state.meshGenerating = true
      state.meshError = null
    },
    
    meshGenerationSuccess: (state, action: PayloadAction<Mesh>) => {
      state.mesh = action.payload
      state.meshGenerating = false
      state.meshError = null
    },
    
    meshGenerationFailure: (state, action: PayloadAction<string>) => {
      state.meshGenerating = false
      state.meshError = action.payload
    },
    
    setMesh: (state, action: PayloadAction<Mesh>) => {
      state.mesh = action.payload
    },
    
    clearMesh: (state) => {
      state.mesh = null
      state.meshError = null
    },
    
    // Sources and lumped elements
    addSource: (state, action: PayloadAction<Source>) => {
      state.sources.push(action.payload)
    },
    
    updateSource: (state, action: PayloadAction<{ index: number; source: Source }>) => {
      if (action.payload.index >= 0 && action.payload.index < state.sources.length) {
        state.sources[action.payload.index] = action.payload.source
      }
    },
    
    removeSource: (state, action: PayloadAction<number>) => {
      state.sources.splice(action.payload, 1)
    },
    
    addLumpedElement: (state, action: PayloadAction<LumpedElement>) => {
      state.lumpedElements.push(action.payload)
    },
    
    updateLumpedElement: (
      state,
      action: PayloadAction<{ index: number; element: LumpedElement }>
    ) => {
      if (action.payload.index >= 0 && action.payload.index < state.lumpedElements.length) {
        state.lumpedElements[action.payload.index] = action.payload.element
      }
    },
    
    removeLumpedElement: (state, action: PayloadAction<number>) => {
      state.lumpedElements.splice(action.payload, 1)
    },
    
    // Solver
    solverStart: (state) => {
      state.solving = true
      state.solverError = null
    },
    
    solverSuccess: (state, action: PayloadAction<SolverResult>) => {
      state.results = action.payload
      state.resultsHistory.push(action.payload)
      state.solving = false
      state.solverError = null
    },
    
    solverFailure: (state, action: PayloadAction<string>) => {
      state.solving = false
      state.solverError = action.payload
    },
    
    clearResults: (state) => {
      state.results = null
      state.solverError = null
    },
    
    // UI state
    setSelectedElement: (state, action: PayloadAction<string | null>) => {
      state.selectedElementId = action.payload
    },
    
    setViewMode: (state, action: PayloadAction<'3d' | 'tree' | 'properties'>) => {
      state.viewMode = action.payload
    },
    
    // Clear design
    clearDesign: () => {
      return initialState
    },
    
    // Load design from saved project
    loadDesign: (_state, action: PayloadAction<Partial<DesignState>>) => {
      return { ...initialState, ...action.payload }
    },
  },
  extraReducers: (builder) => {
    // Generate dipole mesh
    builder
      .addCase(generateDipole.pending, (state) => {
        state.meshGenerating = true;
        state.meshError = null;
        state.antennaType = 'dipole';
      })
      .addCase(generateDipole.fulfilled, (state, action) => {
        state.meshGenerating = false;
        state.mesh = action.payload.mesh;
        state.sources = action.payload.sources || [];
        state.lumpedElements = action.payload.lumped_elements || [];
        state.meshError = null;
      })
      .addCase(generateDipole.rejected, (state, action) => {
        state.meshGenerating = false;
        state.meshError = action.payload as string || 'Mesh generation failed';
      })
      // Generate loop mesh
      .addCase(generateLoop.pending, (state) => {
        state.meshGenerating = true;
        state.meshError = null;
        state.antennaType = 'loop';
      })
      .addCase(generateLoop.fulfilled, (state, action) => {
        state.meshGenerating = false;
        state.mesh = action.payload.mesh;
        state.sources = action.payload.sources || [];
        state.lumpedElements = action.payload.lumped_elements || [];
        state.meshError = null;
      })
      .addCase(generateLoop.rejected, (state, action) => {
        state.meshGenerating = false;
        state.meshError = action.payload as string || 'Mesh generation failed';
      });
  },
})

export const {
  setAntennaType,
  setAntennaConfig,
  meshGenerationStart,
  meshGenerationSuccess,
  meshGenerationFailure,
  setMesh,
  clearMesh,
  addSource,
  updateSource,
  removeSource,
  addLumpedElement,
  updateLumpedElement,
  removeLumpedElement,
  solverStart,
  solverSuccess,
  solverFailure,
  clearResults,
  setSelectedElement,
  setViewMode,
  clearDesign,
  loadDesign,
} = designSlice.actions

export default designSlice.reducer
