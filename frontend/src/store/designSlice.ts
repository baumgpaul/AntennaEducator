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
  AntennaElement,
} from '@/types/models'
import { generateDipoleMesh, generateLoopMesh, generateHelixMesh, generateRodMesh, createDipole, createLoop, createHelix, createRod } from '@/api/preprocessor'
import { getNextElementColor } from '@/utils/colors'

interface DesignState {
  // Multi-element system
  elements: AntennaElement[]
  selectedElementId: string | null
  activeElementId: string | null  // Element being configured in dialog

  // Legacy single antenna fields (for backward compatibility during transition)
  antennaType: 'dipole' | 'loop' | 'helix' | 'rod' | 'custom' | null
  antennaConfig: DipoleConfig | LoopConfig | HelixConfig | RodConfig | null
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
      position: { x: number; y: number; z: number }
      orientation: { x: number; y: number; z: number }
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
      loopType: 'circular' | 'rectangular' | 'polygon'
      radius?: number
      width?: number
      height?: number
      sides?: number
      circumradius?: number
      wireRadius: number
      feedGap: number
      frequency: number
      segments: number
      position: { x: number; y: number; z: number }
      orientation: { rotX: number; rotY: number; rotZ: number }
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
 * Generate helix antenna mesh
 */
export const generateHelix = createAsyncThunk(
  'design/generateHelix',
  async (
    formData: {
      diameter: number
      pitch: number
      turns: number
      helix_mode: 'axial' | 'normal'
      polarization: 'RHCP' | 'LHCP'
      wire_radius: number
      frequency: number
      segments_per_turn: number
      position: { x: number; y: number; z: number }
      orientation: { rotX: number; rotY: number; rotZ: number }
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await generateHelixMesh(formData)
      return { ...response, formData }
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to generate helix mesh')
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
      position: { x: number; y: number; z: number }
      orientation: { rotX: number; rotY: number; rotZ: number }
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await generateRodMesh(formData)
      return response
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to generate rod mesh')
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
        case 'helix': {
          const config: HelixConfig = {
            ...params,
            center_position: [0, 0, 0],
            axis_direction: orientation,
          }
          response = await createHelix(config)
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
          case 'helix':
            target.axis_direction = orientation
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

        // Auto-create voltage source across the gap
        // For a dipole: nodes 1 to (total/2 + 1) spans the gap
        const numNodes = action.payload.mesh?.nodes?.length || 0;
        const gapEndNode = Math.ceil(numNodes / 2) + 1; // Node at start of second arm

        const autoSource: Source = {
          type: 'voltage',
          amplitude: { real: 1, imag: 0 },
          node_start: 1, // First node of first arm
          node_end: gapEndNode, // First node of second arm
          series_R: 0,
          series_L: 0,
          series_C_inv: 0,
          tag: 'Auto-generated feed',
        };

        console.log(`Auto-creating voltage source across gap: 1 → ${gapEndNode} (total nodes: ${numNodes})`);

        // Normalize config: extract parameters from backend response to flat DipoleConfig format
        const backendElement = action.payload.element;
        const normalizedConfig = backendElement?.parameters
          ? { ...backendElement.parameters }  // Backend format: extract parameters dict
          : (backendElement?.config || backendElement || {});  // Already flat or fallback

        // Create AntennaElement from response (use ONLY the auto-source, ignore backend sources)
        const element: AntennaElement = {
          id: `dipole_${Date.now()}`,
          type: 'dipole',
          name: formData?.name || `Dipole ${state.elements.length + 1}`,
          config: normalizedConfig,
          position,
          rotation,
          mesh: action.payload.mesh,
          sources: [autoSource], // Only auto-source, no backend sources
          lumped_elements: action.payload.element?.lumped_elements || [],
          visible: true,
          locked: false,
          color,
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

        // Create AntennaElement from response
        const element: AntennaElement = {
          id: `loop_${Date.now()}`,
          type: 'loop',
          name: formData?.name || `Loop ${state.elements.length + 1}`,
          config: normalizedLoopConfig,
          position,
          rotation,
          mesh: action.payload.mesh,
          visible: true,
          locked: false,
          color,
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
      // Generate helix mesh
      .addCase(generateHelix.pending, (state) => {
        state.meshGenerating = true;
        state.meshError = null;
        state.antennaType = 'helix';
      })
      .addCase(generateHelix.fulfilled, (state, action) => {
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
        const backendHelixElement = action.payload.element;
        const normalizedHelixConfig = backendHelixElement?.parameters
          ? { ...backendHelixElement.parameters }
          : (backendHelixElement?.config || backendHelixElement || {});

        // Create AntennaElement from response
        const element: AntennaElement = {
          id: `helix_${Date.now()}`,
          type: 'helix',
          name: `Helix ${state.elements.length + 1}`,
          config: normalizedHelixConfig,
          position,
          rotation,
          mesh: action.payload.mesh,
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
      .addCase(generateHelix.rejected, (state, action) => {
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
      .addCase(generateRod.rejected, (state, action) => {
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
            case 'helix':
              target.axis_direction = orientation;
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
  updateSource,
  removeSource,
  addLumpedElement,
  addLumpedElementToElement,
  updateLumpedElement,
  removeLumpedElement,
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
