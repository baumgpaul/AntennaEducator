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
  RodConfig,
  AntennaElement,
  AppendedNode,
} from '@/types/models'
import { generateDipoleMesh, generateLoopMesh, generateRodMesh, generateCustomMesh, createDipole, createLoop, createRod } from '@/api/preprocessor'
import { getNextElementColor } from '@/utils/colors'

interface DesignState {
  // Multi-element system
  elements: AntennaElement[]
  selectedElementId: string | null
  activeElementId: string | null  // Element being configured in dialog

  // Legacy single antenna fields (for backward compatibility during transition)
  antennaType: 'dipole' | 'loop' | 'rod' | 'custom' | null
  antennaConfig: DipoleConfig | LoopConfig | RodConfig | null
  mesh: Mesh | null  // Will be phased out in favor of elements[].mesh

  // Solver results
  results: SolverResult | null
  resultsHistory: SolverResult[]
  isSolved: boolean  // Track if current geometry has been solved

  // Sources and lumped elements (global to all elements)
  sources: Source[]
  lumpedElements: LumpedElement[]

  // UI state
  viewMode: '3d' | '2d' | 'tree' | 'properties'

  // Loading states
  meshGenerating: boolean
  solving: boolean

  // Errors
  meshError: string | null
  solverError: string | null
}

const initialState: DesignState = {
  // Multi-element system
  elements: [],
  selectedElementId: null,
  activeElementId: null,

  // Legacy fields
  antennaType: null,
  antennaConfig: null,
  mesh: null,

  // Results and global elements
  results: null,
  resultsHistory: [],
  isSolved: false,
  sources: [],
  lumpedElements: [],

  // UI state
  viewMode: '3d',

  // Loading states
  meshGenerating: false,
  solving: false,

  // Errors
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
      name: string
      length: number
      radius: number
      gap: number
      frequency: number
      segments: number
      feedType: 'gap' | 'balanced'
      sourceType: 'voltage' | 'current'
      sourceAmplitude: number
      sourcePhase: number
      position: { x: number; y: number; z: number }
      orientation: { x: number; y: number; z: number }
      expressions?: Record<string, string>
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await generateDipoleMesh(formData)
      return { ...response, formData } // Include formData for position/rotation
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to generate dipole mesh')
    }
  }
)

/**
 * Generate loop antenna mesh
 */
export const generateLoop = createAsyncThunk(
  'design/generateLoop',
  async (
    formData: {
      name: string
      radius: number
      wireRadius: number
      feedGap: number
      frequency: number
      segments: number
      sourceType: 'voltage' | 'current'
      sourceAmplitude: number
      sourcePhase: number
      position: { x: number; y: number; z: number }
      orientation: { rotX: number; rotY: number; rotZ: number }
      expressions?: Record<string, string>
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await generateLoopMesh(formData)
      return { ...response, formData }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to generate loop mesh')
    }
  }
)

/**
 * Generate rod antenna mesh
 */
export const generateRod = createAsyncThunk(
  'design/generateRod',
  async (
    formData: {
      start_x: number
      start_y: number
      start_z: number
      end_x: number
      end_y: number
      end_z: number
      radius: number
      segments: number
      expressions?: Record<string, string>
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await generateRodMesh(formData)
      return { ...response, formData }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to generate rod mesh')
    }
  }
)

/**
 * Generate custom antenna mesh from explicit node/edge definitions
 */
export const generateCustom = createAsyncThunk(
  'design/generateCustom',
  async (
    formData: {
      name: string
      nodes: Array<{ id: number; x: number; y: number; z: number; radius?: number }>
      edges: Array<{ node_start: number; node_end: number; radius?: number }>
      sources?: Array<{
        type: 'voltage' | 'current'
        amplitude: { real: number; imag: number }
        node_start: number
        node_end: number
        series_R?: number
        series_L?: number
        series_C_inv?: number
        tag?: string
      }>
      lumped_elements?: Array<{
        type: string
        R?: number
        L?: number
        C_inv?: number
        node_start: number
        node_end: number
        tag?: string
      }>
      variable_context?: Array<{ name: string; expression: string; unit?: string; description?: string }>
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await generateCustomMesh(formData)
      return { ...response, formData }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to generate custom antenna mesh')
    }
  }
)

/**
 * Re-mesh an existing antenna element with a new orientation vector.
 * Calls the preprocessor API with the element's existing config + new orientation.
 */
export const remeshElementOrientation = createAsyncThunk(
  'design/remeshElementOrientation',
  async (
    { elementId, orientation }: { elementId: string; orientation: [number, number, number] },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = (getState() as any).design as DesignState
      const element = state.elements.find(el => el.id === elementId)
      if (!element) {
        return rejectWithValue('Element not found')
      }

      let response

      // Config may be in flat format or nested backend format (with .parameters)
      const rawCfg = element.config as any
      const params = rawCfg.parameters || rawCfg

      switch (element.type) {
        case 'dipole': {
          const config: DipoleConfig = {
            length: params.length,
            wire_radius: params.wire_radius,
            gap: params.gap,
            segments: params.segments,
            balanced_feed: params.balanced_feed,
            center_position: [0, 0, 0],
            orientation,
          }
          response = await createDipole(config)
          break
        }
        case 'loop': {
          const config: LoopConfig = {
            ...params,
            center_position: [0, 0, 0],
            normal_vector: orientation,
          }
          response = await createLoop(config)
          break
        }
        case 'rod': {
          const config: RodConfig = {
            ...params,
            direction: orientation,
          }
          response = await createRod(config)
          break
        }
        default:
          return rejectWithValue(`Unknown element type: ${element.type}`)
      }

      return { elementId, orientation, mesh: response.mesh }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to re-mesh element')
    }
  }
)

/**
 * Maps expression field keys to backend config field keys for each antenna type.
 * Used when re-evaluating expressions to update element configs.
 */
const EXPR_TO_CONFIG_KEY: Record<string, Record<string, string>> = {
  dipole: { length: 'length', radius: 'wire_radius', gap: 'gap', segments: 'segments' },
  loop: { radius: 'radius', wireRadius: 'wire_radius', feedGap: 'gap', segments: 'segments' },
  rod: {
    radius: 'wire_radius', segments: 'segments',
    start_x: 'start_x', start_y: 'start_y', start_z: 'start_z',
    end_x: 'end_x', end_y: 'end_y', end_z: 'end_z',
  },
}

/**
 * Re-mesh an existing antenna element after its expression-driven parameters changed.
 * Called when variables change and an element has stored expressions.
 */
export const remeshElementExpressions = createAsyncThunk(
  'design/remeshElementExpressions',
  async (
    {
      elementId,
      resolvedValues,
    }: {
      elementId: string
      resolvedValues: Record<string, number>
    },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = (getState() as any).design as DesignState
      const element = state.elements.find(el => el.id === elementId)
      if (!element) {
        return rejectWithValue('Element not found')
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawCfg = element.config as any
      const params = rawCfg.parameters || rawCfg
      const mapping = EXPR_TO_CONFIG_KEY[element.type] || {}

      // Build updated params by merging current config with new resolved values
      const updatedParams = { ...params }
      for (const [exprKey, value] of Object.entries(resolvedValues)) {
        const configKey = mapping[exprKey]
        if (configKey) {
          updatedParams[configKey] = value
        }
      }

      let response
      switch (element.type) {
        case 'dipole': {
          const config: DipoleConfig = {
            length: updatedParams.length,
            wire_radius: updatedParams.wire_radius,
            gap: updatedParams.gap,
            segments: Math.round(updatedParams.segments ?? params.segments),
            balanced_feed: updatedParams.balanced_feed ?? params.balanced_feed,
            center_position: updatedParams.center_position || [0, 0, 0],
            orientation: updatedParams.orientation || [0, 0, 1],
          }
          response = await createDipole(config)
          break
        }
        case 'loop': {
          const config: LoopConfig = {
            ...updatedParams,
            segments: Math.round(updatedParams.segments ?? params.segments),
            center_position: updatedParams.center_position || [0, 0, 0],
            normal_vector: updatedParams.normal_vector || [0, 0, 1],
          }
          response = await createLoop(config)
          break
        }
        case 'rod': {
          // Rod uses start/end to compute length and direction
          const sx = updatedParams.start_x ?? params.start_point?.[0] ?? 0
          const sy = updatedParams.start_y ?? params.start_point?.[1] ?? 0
          const sz = updatedParams.start_z ?? params.start_point?.[2] ?? 0
          const ex = updatedParams.end_x ?? params.end_point?.[0] ?? 0
          const ey = updatedParams.end_y ?? params.end_point?.[1] ?? 0
          const ez = updatedParams.end_z ?? params.end_point?.[2] ?? 0
          const rdx = ex - sx, rdy = ey - sy, rdz = ez - sz
          const len = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz)
          const dir: [number, number, number] = len > 0 ? [rdx / len, rdy / len, rdz / len] : [0, 0, 1]
          const config: RodConfig = {
            length: len,
            base_position: [sx, sy, sz],
            direction: dir,
            wire_radius: updatedParams.wire_radius ?? params.wire_radius,
            segments: Math.round(updatedParams.segments ?? params.segments),
            start_point: [sx, sy, sz],
            end_point: [ex, ey, ez],
          }
          response = await createRod(config)
          break
        }
        default:
          return rejectWithValue(`Unknown element type: ${element.type}`)
      }

      return { elementId, mesh: response.mesh, updatedParams, sources: response.element?.sources }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to re-mesh element with updated expressions')
    }
  }
)

// ============================================================================
// Slice
// ============================================================================

const designSlice = createSlice({
  name: 'design',
  initialState,
  reducers: {
    // Element management
    addElement: (state, action: PayloadAction<AntennaElement>) => {
      state.elements.push(action.payload)
      // Auto-select the new element
      state.selectedElementId = action.payload.id
      // Invalidate solved state since geometry changed
      state.isSolved = false
    },

    updateElement: (state, action: PayloadAction<{ id: string; updates: Partial<AntennaElement> }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.id)
      if (index >= 0) {
        const updates = action.payload.updates
        // Check if geometry-affecting properties changed (position, rotation)
        if (updates.position || updates.rotation) {
          state.isSolved = false
        }
        state.elements[index] = { ...state.elements[index], ...updates }
      }
    },

    removeElement: (state, action: PayloadAction<string>) => {
      console.log('[removeElement] Removing element:', action.payload);
      console.log('[removeElement] Elements before:', state.elements.map(e => ({ id: e.id, name: e.name })));

      state.elements = state.elements.filter(el => el.id !== action.payload);

      // Invalidate solved state since geometry changed
      state.isSolved = false;

      console.log('[removeElement] Elements after:', state.elements.map(e => ({ id: e.id, name: e.name })));

      // Clear selection if removed element was selected
      if (state.selectedElementId === action.payload) {
        state.selectedElementId = null;
      }

      // Clear legacy mesh if no elements remain (prevents ghost geometry)
      if (state.elements.length === 0) {
        state.mesh = null;
        state.antennaType = null;
        state.antennaConfig = null;
        console.log('[removeElement] Cleared legacy mesh since no elements remain');
      }
    },

    duplicateElement: (state, action: PayloadAction<string>) => {
      const element = state.elements.find(el => el.id === action.payload)
      if (element) {
        const newId = `${element.type}_${Date.now()}`
        const duplicate: AntennaElement = {
          ...element,
          id: newId,
          name: `${element.name} Copy`,
          position: [element.position[0] + 0.1, element.position[1], element.position[2]], // Offset slightly
        }
        state.elements.push(duplicate)
        state.selectedElementId = newId
      }
    },

    setElementVisibility: (state, action: PayloadAction<{ id: string; visible: boolean }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.id)
      if (index >= 0) {
        state.elements[index].visible = action.payload.visible
      }
    },

    setElementLocked: (state, action: PayloadAction<{ id: string; locked: boolean }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.id)
      if (index >= 0) {
        state.elements[index].locked = action.payload.locked
      }
    },

    setElementColor: (state, action: PayloadAction<{ id: string; color: string }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.id)
      if (index >= 0) {
        state.elements[index].color = action.payload.color
      }
    },

    setElementPosition: (state, action: PayloadAction<{ id: string; position: [number, number, number] }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.id)
      if (index >= 0) {
        state.elements[index].position = action.payload.position
        // Invalidate solved state since geometry changed
        state.isSolved = false
      }
    },

    setElementRotation: (state, action: PayloadAction<{ id: string; rotation: [number, number, number] }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.id)
      if (index >= 0) {
        state.elements[index].rotation = action.payload.rotation
        // Invalidate solved state since geometry changed
        state.isSolved = false
      }
    },

    setElementOrientation: (state, action: PayloadAction<{ id: string; orientation: [number, number, number] }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.id)
      if (index >= 0) {
        const element = state.elements[index]
        const orientation = action.payload.orientation

        // Update the orientation in the config (handle both flat and nested formats)
        const cfg = element.config as any
        const target = cfg.parameters || cfg

        switch (element.type) {
          case 'dipole':
            target.orientation = orientation
            break
          case 'loop':
            target.normal_vector = orientation
            break
          case 'rod':
            target.direction = orientation
            break
        }

        // Invalidate solved state since geometry changed
        state.isSolved = false
      }
    },

    setSelectedElement: (state, action: PayloadAction<string | null>) => {
      state.selectedElementId = action.payload
    },

    setActiveElement: (state, action: PayloadAction<string | null>) => {
      state.activeElementId = action.payload
    },

    clearElements: (state) => {
      state.elements = []
      state.selectedElementId = null
      state.activeElementId = null
    },

    // Solver state management
    markAsSolved: (state) => {
      state.isSolved = true
    },

    markAsUnsolved: (state) => {
      state.isSolved = false
    },

    // Legacy antenna configuration (backward compatibility)
    setAntennaType: (
      state,
      action: PayloadAction<'dipole' | 'loop' | 'rod' | 'custom'>
    ) => {
      state.antennaType = action.payload
    },

    setAntennaConfig: (
      state,
      action: PayloadAction<DipoleConfig | LoopConfig | RodConfig>
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

    // Add source to specific element
    addSourceToElement: (state, action: PayloadAction<{ elementId: string; source: Source }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.elementId)
      if (index >= 0) {
        if (!state.elements[index].sources) {
          state.elements[index].sources = []
        }
        state.elements[index].sources!.push(action.payload.source)
      }
      // Also add to global array for backward compatibility
      state.sources.push(action.payload.source)
    },

    // Update the primary source on a specific element
    updateElementSource: (state, action: PayloadAction<{ elementId: string; source: Source }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.elementId)
      if (index >= 0 && state.elements[index].sources && state.elements[index].sources!.length > 0) {
        state.elements[index].sources![0] = action.payload.source
        state.isSolved = false
      }
    },

    addLumpedElement: (state, action: PayloadAction<LumpedElement>) => {
      state.lumpedElements.push(action.payload)
    },

    // Add lumped element to specific element
    addLumpedElementToElement: (state, action: PayloadAction<{ elementId: string; lumpedElement: LumpedElement }>) => {
      const index = state.elements.findIndex(el => el.id === action.payload.elementId)
      if (index >= 0) {
        if (!state.elements[index].lumped_elements) {
          state.elements[index].lumped_elements = []
        }
        state.elements[index].lumped_elements!.push(action.payload.lumpedElement)
      }
      // Also add to global array for backward compatibility
      state.lumpedElements.push(action.payload.lumpedElement)
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

    // Batch-replace circuit data (sources + lumped elements + appended nodes) on an element
    setElementCircuit: (
      state,
      action: PayloadAction<{
        elementId: string
        sources: Source[]
        lumped_elements: LumpedElement[]
        appended_nodes: AppendedNode[]
      }>
    ) => {
      const index = state.elements.findIndex(el => el.id === action.payload.elementId)
      if (index >= 0) {
        state.elements[index].sources = action.payload.sources
        state.elements[index].lumped_elements = action.payload.lumped_elements
        state.elements[index].appended_nodes = action.payload.appended_nodes
        state.isSolved = false
      }
      // Also update global arrays for backward compatibility
      // Remove old entries for this element, then add new ones
      // (simplification: just replace entirely since circuit editor is per-element)
      const otherSources = state.elements
        .filter((_, i) => i !== index)
        .flatMap(el => el.sources || [])
      state.sources = [...otherSources, ...action.payload.sources]
      const otherLumped = state.elements
        .filter((_, i) => i !== index)
        .flatMap(el => el.lumped_elements || [])
      state.lumpedElements = [...otherLumped, ...action.payload.lumped_elements]
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
    // Generate dipole mesh - create element
    builder
      .addCase(generateDipole.pending, (state) => {
        state.meshGenerating = true;
        state.meshError = null;
        state.antennaType = 'dipole';
      })
      .addCase(generateDipole.fulfilled, (state, action) => {
        state.meshGenerating = false;

        console.log('Redux: Dipole generated, payload:', action.payload);

        // Extract position from formData
        const formData = action.payload.formData;
        const position: [number, number, number] = formData
          ? [formData.position.x, formData.position.y, formData.position.z]
          : [0, 0, 0];
        // Orientation is now handled by the backend directly via orientation vector
        // Store zeros for rotation since mesh is already oriented correctly
        const rotation: [number, number, number] = [0, 0, 0];

        // Auto-assign color
        const color = getNextElementColor(state.elements);

        // Normalize config: extract parameters from backend response to flat DipoleConfig format
        const backendElement = action.payload.element;
        const normalizedConfig = backendElement?.parameters
          ? { ...backendElement.parameters }  // Backend format: extract parameters dict
          : (backendElement?.config || backendElement || {});  // Already flat or fallback

        // Create AntennaElement from response (use backend sources — they handle
        // balanced feed, current excitation, and correct node indexing)
        const element: AntennaElement = {
          id: `dipole_${Date.now()}`,
          type: 'dipole',
          name: formData?.name || `Dipole ${state.elements.length + 1}`,
          config: normalizedConfig,
          position,
          rotation,
          mesh: action.payload.mesh,
          sources: action.payload.element?.sources || [],
          lumped_elements: action.payload.element?.lumped_elements || [],
          visible: true,
          locked: false,
          color,
          expressions: formData?.expressions || undefined,
        };

        console.log('Redux: Created element with position:', position, 'rotation:', rotation, 'color:', color);

        // Add to elements array
        state.elements.push(element);
        state.selectedElementId = element.id;        state.isSolved = false; // Invalidate solver state        state.isSolved = false; // Invalidate solver state
        state.isSolved = false; // Invalidate solver state

        // Legacy mesh support (for backward compatibility)
        state.mesh = action.payload.mesh;
        state.sources = action.payload.element?.sources || [];
        state.lumpedElements = action.payload.element?.lumped_elements || [];
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

        const formData = action.payload.formData;
        const position: [number, number, number] = formData
          ? [formData.position.x, formData.position.y, formData.position.z]
          : [0, 0, 0];
        const rotation: [number, number, number] = formData
          ? [formData.orientation.rotX, formData.orientation.rotY, formData.orientation.rotZ]
          : [0, 0, 0];

        // Auto-assign color
        const color = getNextElementColor(state.elements);

        // Normalize config: extract parameters from backend response
        const backendLoopElement = action.payload.element;
        const normalizedLoopConfig = backendLoopElement?.parameters
          ? { ...backendLoopElement.parameters }
          : (backendLoopElement?.config || backendLoopElement || {});

        // Create AntennaElement from response (include backend sources)
        const element: AntennaElement = {
          id: `loop_${Date.now()}`,
          type: 'loop',
          name: formData?.name || `Loop ${state.elements.length + 1}`,
          config: normalizedLoopConfig,
          position,
          rotation,
          mesh: action.payload.mesh,
          sources: action.payload.element?.sources || [],
          lumped_elements: action.payload.element?.lumped_elements || [],
          visible: true,
          locked: false,
          color,
          expressions: formData?.expressions || undefined,
        };

        // Add to elements array
        state.elements.push(element);
        state.selectedElementId = element.id;        state.isSolved = false; // Invalidate solver state
        // Legacy support
        state.mesh = action.payload.mesh;
        state.sources = action.payload.element?.sources || [];
        state.lumpedElements = action.payload.element?.lumped_elements || [];
        state.meshError = null;
      })
      .addCase(generateLoop.rejected, (state, action) => {
        state.meshGenerating = false;
        state.meshError = action.payload as string || 'Mesh generation failed';
      })
      // Generate rod mesh
      .addCase(generateRod.pending, (state) => {
        state.meshGenerating = true;
        state.meshError = null;
        state.antennaType = 'rod';
      })
      .addCase(generateRod.fulfilled, (state, action) => {
        state.meshGenerating = false;

        // Auto-assign color
        const color = getNextElementColor(state.elements);

        // Normalize config: extract parameters from backend response
        const backendRodElement = action.payload.element;
        const normalizedRodConfig = backendRodElement?.parameters
          ? { ...backendRodElement.parameters }
          : (backendRodElement?.config || backendRodElement || {});

        // Rod uses start/end coordinates, not separate position field
        // Position is implicitly defined by the rod geometry
        const element: AntennaElement = {
          id: `rod_${Date.now()}`,
          type: 'rod',
          name: `Rod ${state.elements.length + 1}`,
          config: normalizedRodConfig,
          position: [0, 0, 0], // Rod position is in its geometry
          rotation: [0, 0, 0],
          mesh: action.payload.mesh,
          sources: action.payload.element?.sources || [],
          lumped_elements: action.payload.element?.lumped_elements || [],
          visible: true,
          locked: false,
          color,
          expressions: action.payload.formData?.expressions || undefined,
        };

        // Add to elements array
        state.elements.push(element);
        state.selectedElementId = element.id;
        state.isSolved = false; // Invalidate solver state

        // Legacy support
        state.mesh = action.payload.mesh;
        state.sources = action.payload.element?.sources || [];
        state.lumpedElements = action.payload.element?.lumped_elements || [];
        state.meshError = null;
      })
      .addCase(generateRod.rejected, (state, action) => {
        state.meshGenerating = false;
        state.meshError = action.payload as string || 'Mesh generation failed';
      })
      // Generate custom antenna mesh
      .addCase(generateCustom.pending, (state) => {
        state.meshGenerating = true;
        state.meshError = null;
        state.antennaType = 'custom';
      })
      .addCase(generateCustom.fulfilled, (state, action) => {
        state.meshGenerating = false;

        // Auto-assign color
        const color = getNextElementColor(state.elements);

        // Normalize config: extract parameters from backend response
        const backendCustomElement = action.payload.element;
        const normalizedCustomConfig = backendCustomElement?.parameters
          ? { ...backendCustomElement.parameters }
          : (backendCustomElement?.config || backendCustomElement || {});

        const formData = action.payload.formData;

        const element: AntennaElement = {
          id: `custom_${Date.now()}`,
          type: 'custom',
          name: formData?.name || `Custom ${state.elements.length + 1}`,
          config: normalizedCustomConfig,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          mesh: action.payload.mesh,
          sources: action.payload.element?.sources || [],
          lumped_elements: action.payload.element?.lumped_elements || [],
          visible: true,
          locked: false,
          color,
        };

        // Add to elements array
        state.elements.push(element);
        state.selectedElementId = element.id;
        state.isSolved = false; // Invalidate solver state

        // Legacy support
        state.mesh = action.payload.mesh;
        state.sources = action.payload.element?.sources || [];
        state.lumpedElements = action.payload.element?.lumped_elements || [];
        state.meshError = null;
      })
      .addCase(generateCustom.rejected, (state, action) => {
        state.meshGenerating = false;
        state.meshError = action.payload as string || 'Mesh generation failed';
      })
      // Re-mesh element after orientation change
      .addCase(remeshElementOrientation.pending, (state) => {
        state.meshGenerating = true;
        state.meshError = null;
      })
      .addCase(remeshElementOrientation.fulfilled, (state, action) => {
        state.meshGenerating = false;
        const { elementId, orientation, mesh } = action.payload;
        const index = state.elements.findIndex(el => el.id === elementId);
        if (index >= 0) {
          const element = state.elements[index];
          // Update mesh with new geometry
          element.mesh = mesh;

          // Update the orientation in the config (handle both flat and nested formats)
          const cfg = element.config as any;
          const target = cfg.parameters || cfg;

          switch (element.type) {
            case 'dipole':
              target.orientation = orientation;
              break;
            case 'loop':
              target.normal_vector = orientation;
              break;
            case 'rod':
              target.direction = orientation;
              break;
          }

          // Invalidate solved state
          state.isSolved = false;

          // Update legacy mesh if this is the active element
          state.mesh = mesh;
        }
      })
      .addCase(remeshElementOrientation.rejected, (state, action) => {
        state.meshGenerating = false;
        state.meshError = action.payload as string || 'Failed to re-mesh element';
      })
      // Re-mesh element after expression/variable change
      .addCase(remeshElementExpressions.pending, (state) => {
        state.meshGenerating = true;
        state.meshError = null;
      })
      .addCase(remeshElementExpressions.fulfilled, (state, action) => {
        state.meshGenerating = false;
        const { elementId, mesh, updatedParams, sources } = action.payload;
        const index = state.elements.findIndex(el => el.id === elementId);
        if (index >= 0) {
          const element = state.elements[index];
          element.mesh = mesh;

          // Merge updated config values
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cfg = element.config as any;
          const target = cfg.parameters || cfg;
          Object.assign(target, updatedParams);

          // Update sources if returned (they may reference new geometry)
          if (sources) {
            element.sources = sources;
          }

          state.isSolved = false;
          state.mesh = mesh;
        }
      })
      .addCase(remeshElementExpressions.rejected, (state, action) => {
        state.meshGenerating = false;
        state.meshError = action.payload as string || 'Failed to re-mesh with updated expressions';
      });
  },
})

export const {
  // Element management
  addElement,
  updateElement,
  removeElement,
  duplicateElement,
  setElementVisibility,
  setElementLocked,
  setElementColor,
  setElementPosition,
  setElementRotation,
  setElementOrientation,
  setSelectedElement,
  setActiveElement,
  clearElements,
  // Solver state
  markAsSolved,
  markAsUnsolved,
  // Legacy actions
  setAntennaType,
  setAntennaConfig,
  meshGenerationStart,
  meshGenerationSuccess,
  meshGenerationFailure,
  setMesh,
  clearMesh,
  addSource,
  addSourceToElement,
  updateElementSource,
  updateSource,
  removeSource,
  addLumpedElement,
  addLumpedElementToElement,
  updateLumpedElement,
  removeLumpedElement,
  setElementCircuit,
  solverStart,
  solverSuccess,
  solverFailure,
  clearResults,
  setViewMode,
  clearDesign,
  loadDesign,
} = designSlice.actions

// Selectors
export const selectIsSolved = (state: any) => state.design.isSolved

export default designSlice.reducer
