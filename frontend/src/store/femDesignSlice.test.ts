/**
 * Tests for femDesignSlice — geometry operations, mesh, physics, invalidation.
 */

import { configureStore } from '@reduxjs/toolkit'
import femDesignReducer, {
  addGeometryOperation,
  removeGeometryOperation,
  clearGeometry,
  selectEntity,
  setActiveTool,
  addPendingPoint,
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
  resetFEMDesign,
  incrementNamingCounter,
  renameEntity,
  selectFEMGeometryOps,
  selectFEMMesh,
  selectFEMMeshStatus,
  selectFEMActiveTool,
  selectFEMSelectedEntity,
  selectFEMPDEType,
  selectFEMResultsStale,
  selectFEMNamingCounters,
  type FEMDesignState,
} from './femDesignSlice'

function createTestStore(preloadedState?: { femDesign: FEMDesignState }) {
  return configureStore({
    reducer: { femDesign: femDesignReducer },
    preloadedState,
  })
}

describe('femDesignSlice', () => {
  describe('geometry operations', () => {
    it('should add a geometry operation', () => {
      const store = createTestStore()
      const op = { type: 'add_rectangle' as const, params: { x: 0, y: 0, width: 1, height: 1 } }

      store.dispatch(addGeometryOperation(op))

      const ops = selectFEMGeometryOps(store.getState())
      expect(ops).toHaveLength(1)
      expect(ops[0].type).toBe('add_rectangle')
    })

    it('should remove a geometry operation by index', () => {
      const store = createTestStore()
      store.dispatch(addGeometryOperation({ type: 'add_rectangle', params: { x: 0, y: 0, width: 1, height: 1 } }))
      store.dispatch(addGeometryOperation({ type: 'add_circle', params: { cx: 0, cy: 0, radius: 1 } }))

      store.dispatch(removeGeometryOperation(0))

      const ops = selectFEMGeometryOps(store.getState())
      expect(ops).toHaveLength(1)
      expect(ops[0].type).toBe('add_circle')
    })

    it('should clear all geometry', () => {
      const store = createTestStore()
      store.dispatch(addGeometryOperation({ type: 'add_rectangle', params: {} }))

      store.dispatch(clearGeometry())

      expect(selectFEMGeometryOps(store.getState())).toHaveLength(0)
      expect(selectFEMMesh(store.getState())).toBeNull()
    })

    it('should mark mesh stale when geometry changes', () => {
      const store = createTestStore()
      store.dispatch(addGeometryOperation({ type: 'add_rectangle', params: {} }))

      expect(store.getState().femDesign.meshStale).toBe(true)
    })
  })

  describe('selection', () => {
    it('should select an entity', () => {
      const store = createTestStore()

      store.dispatch(selectEntity({ id: 'body_1', type: 'body' }))

      const sel = selectFEMSelectedEntity(store.getState())
      expect(sel.id).toBe('body_1')
      expect(sel.type).toBe('body')
    })

    it('should clear selection', () => {
      const store = createTestStore()
      store.dispatch(selectEntity({ id: 'body_1', type: 'body' }))

      store.dispatch(selectEntity({ id: null, type: null }))

      const sel = selectFEMSelectedEntity(store.getState())
      expect(sel.id).toBeNull()
    })
  })

  describe('drawing tools', () => {
    it('should set active tool', () => {
      const store = createTestStore()

      store.dispatch(setActiveTool('rectangle'))

      expect(selectFEMActiveTool(store.getState())).toBe('rectangle')
    })

    it('should reset tool state when switching tools', () => {
      const store = createTestStore()
      store.dispatch(setActiveTool('line'))
      store.dispatch(addPendingPoint([1, 2]))

      store.dispatch(setActiveTool('select'))

      expect(store.getState().femDesign.toolState.pendingPoints).toHaveLength(0)
    })

    it('should accumulate pending points', () => {
      const store = createTestStore()
      store.dispatch(setActiveTool('polygon'))
      store.dispatch(addPendingPoint([0, 0]))
      store.dispatch(addPendingPoint([1, 0]))
      store.dispatch(addPendingPoint([0.5, 1]))

      expect(store.getState().femDesign.toolState.pendingPoints).toHaveLength(3)
    })

    it('should reset tool state explicitly', () => {
      const store = createTestStore()
      store.dispatch(addPendingPoint([1, 2]))

      store.dispatch(resetToolState())

      expect(store.getState().femDesign.toolState.pendingPoints).toHaveLength(0)
    })
  })

  describe('discretization', () => {
    it('should update discretization settings partially', () => {
      const store = createTestStore()

      store.dispatch(setDiscretization({ globalElementSize: 0.1, algorithm: 'delaunay' }))

      const d = store.getState().femDesign.discretization
      expect(d.globalElementSize).toBe(0.1)
      expect(d.algorithm).toBe('delaunay')
      // Unchanged defaults
      expect(d.growthRate).toBe(1.2)
    })

    it('should mark mesh stale on discretization change', () => {
      const store = createTestStore()

      store.dispatch(setDiscretization({ globalElementSize: 0.05 }))

      expect(store.getState().femDesign.meshStale).toBe(true)
    })
  })

  describe('mesh lifecycle', () => {
    it('should set mesh generating state', () => {
      const store = createTestStore()

      store.dispatch(setMeshGenerating())

      expect(selectFEMMeshStatus(store.getState())).toBe('generating')
    })

    it('should set mesh with statistics', () => {
      const store = createTestStore()
      const mesh = {
        nodes: [{ id: 0, coords: [0, 0] as [number, number] }],
        elements: [{ id: 0, elementType: 'tri3' as const, nodeIds: [0, 1, 2], regionId: 0 }],
        regions: [{ id: 0, name: 'domain', materialId: null }],
        boundaryEdges: [],
        elementType: 'tri3' as const,
        dimension: 2,
        metadata: {},
      }

      store.dispatch(setMesh(mesh))

      expect(selectFEMMeshStatus(store.getState())).toBe('ready')
      expect(selectFEMMesh(store.getState())).toBeDefined()
      expect(store.getState().femDesign.meshStatistics?.nNodes).toBe(1)
      expect(store.getState().femDesign.meshStale).toBe(false)
    })

    it('should set mesh error', () => {
      const store = createTestStore()

      store.dispatch(setMeshError('Gmsh failed'))

      expect(selectFEMMeshStatus(store.getState())).toBe('none')
      expect(store.getState().femDesign.meshError).toBe('Gmsh failed')
    })

    it('should clear mesh', () => {
      const store = createTestStore()
      const mesh = {
        nodes: [], elements: [], regions: [], boundaryEdges: [],
        elementType: 'tri3' as const, dimension: 2, metadata: {},
      }
      store.dispatch(setMesh(mesh))

      store.dispatch(clearMesh())

      expect(selectFEMMesh(store.getState())).toBeNull()
      expect(selectFEMMeshStatus(store.getState())).toBe('none')
    })
  })

  describe('physics', () => {
    it('should set PDE type', () => {
      const store = createTestStore()

      store.dispatch(setPDEType('magnetostatic'))

      expect(selectFEMPDEType(store.getState())).toBe('magnetostatic')
    })

    it('should add and remove materials', () => {
      const store = createTestStore()
      const material = { id: 'mat1', name: 'Copper', properties: [] }

      store.dispatch(addMaterial(material))
      expect(store.getState().femDesign.materials).toHaveLength(1)

      store.dispatch(removeMaterial('mat1'))
      expect(store.getState().femDesign.materials).toHaveLength(0)
    })

    it('should assign material to body', () => {
      const store = createTestStore()

      store.dispatch(assignMaterial({ bodyId: 'b1', materialId: 'mat1' }))

      expect(store.getState().femDesign.materialAssignments).toHaveLength(1)
    })

    it('should overwrite existing material assignment for same body', () => {
      const store = createTestStore()
      store.dispatch(assignMaterial({ bodyId: 'b1', materialId: 'mat1' }))

      store.dispatch(assignMaterial({ bodyId: 'b1', materialId: 'mat2' }))

      const assignments = store.getState().femDesign.materialAssignments
      expect(assignments).toHaveLength(1)
      expect(assignments[0].materialId).toBe('mat2')
    })

    it('should remove material assignments when material is deleted', () => {
      const store = createTestStore()
      store.dispatch(addMaterial({ id: 'mat1', name: 'Copper', properties: [] }))
      store.dispatch(assignMaterial({ bodyId: 'b1', materialId: 'mat1' }))

      store.dispatch(removeMaterial('mat1'))

      expect(store.getState().femDesign.materialAssignments).toHaveLength(0)
    })

    it('should add/update/remove boundary conditions', () => {
      const store = createTestStore()
      const bc = { id: 'bc1', name: 'Ground', type: 'dirichlet' as const, value: 0, edgeIds: ['e1'] }

      store.dispatch(addBoundaryCondition(bc))
      expect(store.getState().femDesign.boundaryConditions).toHaveLength(1)

      store.dispatch(updateBoundaryCondition({ ...bc, value: 100 }))
      expect(store.getState().femDesign.boundaryConditions[0].value).toBe(100)

      store.dispatch(removeBoundaryCondition('bc1'))
      expect(store.getState().femDesign.boundaryConditions).toHaveLength(0)
    })

    it('should add/remove excitations', () => {
      const store = createTestStore()
      const exc = { id: 'exc1', name: 'Source', type: 'volume_source' as const, value: 1e6, bodyIds: ['b1'] }

      store.dispatch(addExcitation(exc))
      expect(store.getState().femDesign.excitations).toHaveLength(1)

      store.dispatch(removeExcitation('exc1'))
      expect(store.getState().femDesign.excitations).toHaveLength(0)
    })
  })

  describe('invalidation', () => {
    it('should mark results stale on geometry change', () => {
      const store = createTestStore()

      store.dispatch(addGeometryOperation({ type: 'add_rectangle', params: {} }))

      expect(selectFEMResultsStale(store.getState())).toBe(true)
    })

    it('should mark results stale on physics change', () => {
      const store = createTestStore()

      store.dispatch(setPDEType('current_flow'))

      expect(selectFEMResultsStale(store.getState())).toBe(true)
    })

    it('should mark results stale on BC change', () => {
      const store = createTestStore()

      store.dispatch(addBoundaryCondition({
        id: 'bc1', name: 'V', type: 'dirichlet', value: 100, edgeIds: ['e1'],
      }))

      expect(selectFEMResultsStale(store.getState())).toBe(true)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      const store = createTestStore()
      store.dispatch(addGeometryOperation({ type: 'add_rectangle', params: {} }))
      store.dispatch(setPDEType('magnetostatic'))

      store.dispatch(resetFEMDesign())

      expect(selectFEMGeometryOps(store.getState())).toHaveLength(0)
      expect(selectFEMPDEType(store.getState())).toBe('electrostatic')
    })

    it('should reset naming counters on full reset', () => {
      const store = createTestStore()
      store.dispatch(incrementNamingCounter('rectangle'))
      store.dispatch(incrementNamingCounter('rectangle'))

      store.dispatch(resetFEMDesign())

      const c = selectFEMNamingCounters(store.getState())
      expect(c.rectangle).toBe(0)
    })
  })

  describe('naming counters', () => {
    it('should increment naming counter for a primitive type', () => {
      const store = createTestStore()

      store.dispatch(incrementNamingCounter('rectangle'))
      store.dispatch(incrementNamingCounter('rectangle'))
      store.dispatch(incrementNamingCounter('circle'))

      const c = selectFEMNamingCounters(store.getState())
      expect(c.rectangle).toBe(2)
      expect(c.circle).toBe(1)
      expect(c.ellipse).toBe(0)
    })

    it('should reset naming counters when geometry is cleared', () => {
      const store = createTestStore()
      store.dispatch(incrementNamingCounter('rectangle'))

      store.dispatch(clearGeometry())

      const c = selectFEMNamingCounters(store.getState())
      expect(c.rectangle).toBe(0)
    })
  })

  describe('entity rename', () => {
    it('should rename a surface in evaluated geometry', () => {
      const store = createTestStore()
      // Set up evaluated geometry with a surface
      const stateWithGeom: FEMDesignState = {
        ...store.getState().femDesign,
        evaluatedGeometry: {
          surfaces: [{ id: 's1', name: 'rect_1', primitiveType: 'rectangle', edgeIds: ['e1'], innerLoops: [] }],
          bodies: [{ id: 's1', name: 'rect_1', primitiveType: 'rectangle', edgeIds: ['e1'], innerLoops: [] }],
          edges: [{ id: 'e1', name: 'rect_1_bottom', edgeType: 'line', pointIds: ['p1', 'p2'], parentSurfaceId: 's1' }],
          points: [],
        },
      }
      const storeWithGeom = createTestStore({ femDesign: stateWithGeom })

      storeWithGeom.dispatch(renameEntity({ id: 's1', newName: 'my_plate' }))

      const eg = storeWithGeom.getState().femDesign.evaluatedGeometry!
      expect(eg.surfaces[0].name).toBe('my_plate')
      expect(eg.bodies[0].name).toBe('my_plate')
    })

    it('should rename an edge in evaluated geometry', () => {
      const store = createTestStore()
      const stateWithGeom: FEMDesignState = {
        ...store.getState().femDesign,
        evaluatedGeometry: {
          surfaces: [],
          bodies: [],
          edges: [{ id: 'e1', name: 'rect_1_bottom', edgeType: 'line', pointIds: ['p1', 'p2'], parentSurfaceId: 's1' }],
          points: [],
        },
      }
      const storeWithGeom = createTestStore({ femDesign: stateWithGeom })

      storeWithGeom.dispatch(renameEntity({ id: 'e1', newName: 'ground_edge' }))

      const eg = storeWithGeom.getState().femDesign.evaluatedGeometry!
      expect(eg.edges[0].name).toBe('ground_edge')
    })
  })

  describe('surface selection', () => {
    it('should support surface entity type', () => {
      const store = createTestStore()

      store.dispatch(selectEntity({ id: 'surf_1', type: 'surface' }))

      const sel = selectFEMSelectedEntity(store.getState())
      expect(sel.id).toBe('surf_1')
      expect(sel.type).toBe('surface')
    })
  })
})
