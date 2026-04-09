/**
 * FEM Design state slice
 * Manages geometry operations, mesh, materials, BCs, and physics assignments.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import type {
  GeoOperation,
  EvaluatedGeometry,
  ToolType,
  ToolState,
} from '@/types/femGeometry'
import type { FEMMesh, MeshStatus, MeshStatistics } from '@/types/femMesh'
import type {
  PDEType,
  Material,
  MaterialAssignment,
  BoundaryCondition,
  Excitation,
} from '@/types/femPhysics'

// ── Discretization settings (matches backend) ────────────────

export interface FEMDiscretizationSettings {
  elementType: 'tri3' | 'tri6' | 'quad4'
  globalElementSize: number | 'auto'
  minElementSize: number | 'auto'
  growthRate: number
  algorithm: string
  optimize: boolean
  recombineToQuads: boolean
  bodySizes: Record<string, number>
  edgeDivisions: Record<string, number>
}

const defaultDiscretization: FEMDiscretizationSettings = {
  elementType: 'tri3',
  globalElementSize: 'auto',
  minElementSize: 'auto',
  growthRate: 1.2,
  algorithm: 'frontal_delaunay',
  optimize: true,
  recombineToQuads: false,
  bodySizes: {},
  edgeDivisions: {},
}

// ── State interface ───────────────────────────────────────────

export interface FEMDesignState {
  // Geometry (parametric operation history)
  geometryOperations: GeoOperation[]
  evaluatedGeometry: EvaluatedGeometry | null
  selectedEntityId: string | null
  selectedEntityType: 'point' | 'edge' | 'body' | null

  // Active drawing tool
  activeTool: ToolType
  toolState: ToolState

  // Discretization
  discretization: FEMDiscretizationSettings

  // Mesh
  mesh: FEMMesh | null
  meshStatus: MeshStatus
  meshStatistics: MeshStatistics | null
  meshError: string | null

  // Physics
  pdeType: PDEType
  materials: Material[]
  materialAssignments: MaterialAssignment[]
  boundaryConditions: BoundaryCondition[]
  excitations: Excitation[]

  // Validity tracking
  meshStale: boolean
  resultsStale: boolean
}

const initialState: FEMDesignState = {
  geometryOperations: [],
  evaluatedGeometry: null,
  selectedEntityId: null,
  selectedEntityType: null,

  activeTool: 'select',
  toolState: { pendingPoints: [], previewPoint: null },

  discretization: defaultDiscretization,

  mesh: null,
  meshStatus: 'none',
  meshStatistics: null,
  meshError: null,

  pdeType: 'electrostatic',
  materials: [],
  materialAssignments: [],
  boundaryConditions: [],
  excitations: [],

  meshStale: false,
  resultsStale: false,
}

// ── Slice ─────────────────────────────────────────────────────

const femDesignSlice = createSlice({
  name: 'femDesign',
  initialState,
  reducers: {
    // — Geometry operations —
    addGeometryOperation(state, action: PayloadAction<GeoOperation>) {
      state.geometryOperations.push(action.payload)
      state.meshStale = true
      state.resultsStale = true
    },
    removeGeometryOperation(state, action: PayloadAction<number>) {
      state.geometryOperations.splice(action.payload, 1)
      state.meshStale = true
      state.resultsStale = true
    },
    clearGeometry(state) {
      state.geometryOperations = []
      state.evaluatedGeometry = null
      state.mesh = null
      state.meshStatus = 'none'
      state.meshStale = false
      state.resultsStale = true
    },
    setEvaluatedGeometry(state, action: PayloadAction<EvaluatedGeometry | null>) {
      state.evaluatedGeometry = action.payload
    },

    // — Selection —
    selectEntity(
      state,
      action: PayloadAction<{
        id: string | null
        type: 'point' | 'edge' | 'body' | null
      }>
    ) {
      state.selectedEntityId = action.payload.id
      state.selectedEntityType = action.payload.type
    },

    // — Drawing tools —
    setActiveTool(state, action: PayloadAction<ToolType>) {
      state.activeTool = action.payload
      state.toolState = { pendingPoints: [], previewPoint: null }
    },
    addPendingPoint(state, action: PayloadAction<[number, number]>) {
      state.toolState.pendingPoints.push(action.payload)
    },
    setPreviewPoint(state, action: PayloadAction<[number, number] | null>) {
      state.toolState.previewPoint = action.payload
    },
    resetToolState(state) {
      state.toolState = { pendingPoints: [], previewPoint: null }
    },

    // — Discretization —
    setDiscretization(
      state,
      action: PayloadAction<Partial<FEMDiscretizationSettings>>
    ) {
      Object.assign(state.discretization, action.payload)
      state.meshStale = true
    },

    // — Mesh —
    setMeshGenerating(state) {
      state.meshStatus = 'generating'
      state.meshError = null
    },
    setMesh(state, action: PayloadAction<FEMMesh>) {
      state.mesh = action.payload
      state.meshStatus = 'ready'
      state.meshStale = false
      state.meshStatistics = {
        nNodes: action.payload.nodes.length,
        nElements: action.payload.elements.length,
        nRegions: action.payload.regions.length,
        nBoundaryEdges: action.payload.boundaryEdges.length,
        minElementQuality: 0,
        avgElementQuality: 0,
      }
    },
    setMeshError(state, action: PayloadAction<string>) {
      state.meshStatus = 'none'
      state.meshError = action.payload
    },
    clearMesh(state) {
      state.mesh = null
      state.meshStatus = 'none'
      state.meshStatistics = null
      state.resultsStale = true
    },

    // — Physics —
    setPDEType(state, action: PayloadAction<PDEType>) {
      state.pdeType = action.payload
      state.resultsStale = true
    },
    addMaterial(state, action: PayloadAction<Material>) {
      state.materials.push(action.payload)
    },
    removeMaterial(state, action: PayloadAction<string>) {
      state.materials = state.materials.filter((m) => m.id !== action.payload)
      state.materialAssignments = state.materialAssignments.filter(
        (a) => a.materialId !== action.payload
      )
      state.resultsStale = true
    },
    assignMaterial(state, action: PayloadAction<MaterialAssignment>) {
      const existing = state.materialAssignments.findIndex(
        (a) => a.bodyId === action.payload.bodyId
      )
      if (existing >= 0) {
        state.materialAssignments[existing] = action.payload
      } else {
        state.materialAssignments.push(action.payload)
      }
      state.resultsStale = true
    },
    addBoundaryCondition(state, action: PayloadAction<BoundaryCondition>) {
      state.boundaryConditions.push(action.payload)
      state.resultsStale = true
    },
    removeBoundaryCondition(state, action: PayloadAction<string>) {
      state.boundaryConditions = state.boundaryConditions.filter(
        (bc) => bc.id !== action.payload
      )
      state.resultsStale = true
    },
    updateBoundaryCondition(state, action: PayloadAction<BoundaryCondition>) {
      const idx = state.boundaryConditions.findIndex(
        (bc) => bc.id === action.payload.id
      )
      if (idx >= 0) {
        state.boundaryConditions[idx] = action.payload
        state.resultsStale = true
      }
    },
    addExcitation(state, action: PayloadAction<Excitation>) {
      state.excitations.push(action.payload)
      state.resultsStale = true
    },
    removeExcitation(state, action: PayloadAction<string>) {
      state.excitations = state.excitations.filter(
        (e) => e.id !== action.payload
      )
      state.resultsStale = true
    },

    // — Staleness —
    markResultsStale(state) {
      state.resultsStale = true
    },
    clearStale(state) {
      state.resultsStale = false
    },

    // — Reset —
    resetFEMDesign() {
      return initialState
    },
  },
})

// ── Exports ───────────────────────────────────────────────────

export const {
  addGeometryOperation,
  removeGeometryOperation,
  clearGeometry,
  setEvaluatedGeometry,
  selectEntity,
  setActiveTool,
  addPendingPoint,
  setPreviewPoint,
  resetToolState,
  setDiscretization,
  setMeshGenerating,
  setMesh,
  setMeshError,
  clearMesh,
  setPDEType,
  addMaterial,
  removeMaterial,
  assignMaterial,
  addBoundaryCondition,
  removeBoundaryCondition,
  updateBoundaryCondition,
  addExcitation,
  removeExcitation,
  markResultsStale,
  clearStale,
  resetFEMDesign,
} = femDesignSlice.actions

// ── Selectors ─────────────────────────────────────────────────

export const selectFEMGeometryOps = (state: RootState) =>
  state.femDesign.geometryOperations
export const selectFEMMesh = (state: RootState) => state.femDesign.mesh
export const selectFEMMeshStatus = (state: RootState) =>
  state.femDesign.meshStatus
export const selectFEMActiveTool = (state: RootState) =>
  state.femDesign.activeTool
export const selectFEMSelectedEntity = (state: RootState) => ({
  id: state.femDesign.selectedEntityId,
  type: state.femDesign.selectedEntityType,
})
export const selectFEMPDEType = (state: RootState) => state.femDesign.pdeType
export const selectFEMMaterials = (state: RootState) =>
  state.femDesign.materials
export const selectFEMBoundaryConditions = (state: RootState) =>
  state.femDesign.boundaryConditions
export const selectFEMResultsStale = (state: RootState) =>
  state.femDesign.resultsStale

export default femDesignSlice.reducer
