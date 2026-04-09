/**
 * E2E Electrostatic Validation — frontend pipeline tests.
 *
 * Validates the full Redux data flow: geometry → mesh → physics → solve → results.
 * Uses real Redux store (no DOM rendering needed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import femDesignReducer, {
  addGeometryOperation,
  setMesh,
  addMaterial,
  addBoundaryCondition,
  clearStale,
} from '@/store/femDesignSlice'
import femSolverReducer, {
  setSolving,
  setSolveResult,
  setSolveError,
  clearSolveResult,
  setSelectedField,
  setDisplayMode,
  toggleMeshOverlay,
  toggleVectors,
  setColorMap,
  setColorRange,
  addLinePlot,
  setLinePlotData,
  addProbe,
  setProbeResult,
} from '@/store/femSolverSlice'
import { runFEMSolve } from '@/store/femSolverThunks'
import type { FEMMesh } from '@/types/femMesh'
import type { FEMSolverResult } from '@/types/femSolver'
import type { GeoOperation } from '@/types/femGeometry'

// Mock API
vi.mock('@/api/femSolver', () => ({
  solveFEM: vi.fn(),
}))
vi.mock('@/api/femPostprocessor', () => ({
  getFieldVisualization: vi.fn(),
  getLinePlotData: vi.fn(),
  getPointProbe: vi.fn(),
}))

function createStore() {
  return configureStore({
    reducer: {
      femDesign: femDesignReducer,
      femSolver: femSolverReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  })
}

// --- Realistic test data for a parallel plate capacitor ---

const plateCapacitorMesh: FEMMesh = {
  dimension: 2,
  nodes: [
    { id: 0, coords: [0, 0] },
    { id: 1, coords: [0.5, 0] },
    { id: 2, coords: [1, 0] },
    { id: 3, coords: [0, 0.5] },
    { id: 4, coords: [0.5, 0.5] },
    { id: 5, coords: [1, 0.5] },
    { id: 6, coords: [0, 1] },
    { id: 7, coords: [0.5, 1] },
    { id: 8, coords: [1, 1] },
  ],
  elements: [
    { id: 0, elementType: 'tri3', nodeIds: [0, 1, 4], regionId: 0 },
    { id: 1, elementType: 'tri3', nodeIds: [0, 4, 3], regionId: 0 },
    { id: 2, elementType: 'tri3', nodeIds: [1, 2, 5], regionId: 0 },
    { id: 3, elementType: 'tri3', nodeIds: [1, 5, 4], regionId: 0 },
    { id: 4, elementType: 'tri3', nodeIds: [3, 4, 7], regionId: 0 },
    { id: 5, elementType: 'tri3', nodeIds: [3, 7, 6], regionId: 0 },
    { id: 6, elementType: 'tri3', nodeIds: [4, 5, 8], regionId: 0 },
    { id: 7, elementType: 'tri3', nodeIds: [4, 8, 7], regionId: 0 },
  ],
  regions: [{ id: 0, name: 'dielectric', materialId: 'vacuum' }],
  boundaryEdges: [
    { id: 0, nodeIds: [0, 1], regionName: 'bottom' },
    { id: 1, nodeIds: [1, 2], regionName: 'bottom' },
    { id: 2, nodeIds: [6, 7], regionName: 'top' },
    { id: 3, nodeIds: [7, 8], regionName: 'top' },
  ],
  elementType: 'tri3',
  metadata: {},
}

const plateCapacitorResult: FEMSolverResult = {
  scalarFields: [
    {
      name: 'electric_potential',
      values: [0, 0, 0, 50, 50, 50, 100, 100, 100],
      unit: 'V',
      min: 0,
      max: 100,
    },
  ],
  vectorFields: [
    {
      name: 'electric_field',
      values: [
        [0, -100],
        [0, -100],
        [0, -100],
        [0, -100],
        [0, -100],
        [0, -100],
        [0, -100],
        [0, -100],
      ],
      unit: 'V/m',
      maxMagnitude: 100,
    },
  ],
  integralQuantities: [
    { name: 'electric_energy', value: 4.427e-8, unit: 'J' },
  ],
  solveTimeMs: 12,
  nDofs: 9,
}

describe('E2E Electrostatic Pipeline', () => {
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    vi.clearAllMocks()
    store = createStore()
  })

  it('step 1: define geometry → operations stored', () => {
    const op: GeoOperation = {
      type: 'add_rectangle',
      params: { cx: 0.5, cy: 0.5, width: 1, height: 1, tag: 'plate' },
    }
    store.dispatch(addGeometryOperation(op))

    const state = store.getState()
    expect(state.femDesign.geometryOperations).toHaveLength(1)
    expect(state.femDesign.geometryOperations[0].type).toBe('add_rectangle')
    expect(state.femDesign.meshStale).toBe(true)
  })

  it('step 2: assign mesh → mesh stored and stale cleared', () => {
    store.dispatch(setMesh(plateCapacitorMesh))

    const state = store.getState()
    expect(state.femDesign.mesh).not.toBeNull()
    expect(state.femDesign.mesh!.nodes).toHaveLength(9)
    expect(state.femDesign.mesh!.elements).toHaveLength(8)
    expect(state.femDesign.meshStatus).toBe('ready')
  })

  it('step 3: assign material + BCs → physics configured', () => {
    store.dispatch(
      addMaterial({
        id: 'vacuum',
        name: 'Vacuum',
        type: 'electrostatic',
        properties: { epsilon_r: 1.0 },
      })
    )
    store.dispatch(
      addBoundaryCondition({
        id: 'bc_bottom',
        name: 'Ground',
        type: 'dirichlet',
        boundaryName: 'bottom',
        value: '0',
      })
    )
    store.dispatch(
      addBoundaryCondition({
        id: 'bc_top',
        name: 'V+',
        type: 'dirichlet',
        boundaryName: 'top',
        value: '100',
      })
    )

    const state = store.getState()
    expect(state.femDesign.materials).toHaveLength(1)
    expect(state.femDesign.materials[0].properties.epsilon_r).toBe(1.0)
    expect(state.femDesign.boundaryConditions).toHaveLength(2)
  })

  it('step 4: solve → result stored with fields', async () => {
    // Setup
    store.dispatch(setMesh(plateCapacitorMesh))
    const { solveFEM } = await import('@/api/femSolver')
    vi.mocked(solveFEM).mockResolvedValue(plateCapacitorResult)

    // Solve
    await store.dispatch(runFEMSolve())

    const state = store.getState()
    expect(state.femSolver.solveStatus).toBe('done')
    expect(state.femSolver.result).not.toBeNull()

    // Verify scalar field auto-selected
    expect(state.femSolver.selectedField).toBe('electric_potential')

    // Verify fields present
    const result = state.femSolver.result!
    expect(result.scalarFields).toHaveLength(1)
    expect(result.vectorFields).toHaveLength(1)
    expect(result.integralQuantities).toHaveLength(1)

    // Verify potential values
    expect(result.scalarFields[0].values).toEqual(
      [0, 0, 0, 50, 50, 50, 100, 100, 100]
    )

    // Verify E-field uniform
    for (const ev of result.vectorFields[0].values) {
      expect(ev).toEqual([0, -100])
    }

    // Verify energy
    expect(result.integralQuantities[0].name).toBe('electric_energy')
    expect(result.integralQuantities[0].value).toBeCloseTo(4.427e-8, 10)
  })

  it('step 5: postprocessing view config → state updates', () => {
    // Populate result first
    store.dispatch(setSolveResult(plateCapacitorResult))

    // Change visualization settings
    store.dispatch(setSelectedField('electric_potential'))
    store.dispatch(setDisplayMode('contour'))
    store.dispatch(setColorMap('jet'))
    store.dispatch(setColorRange([0, 100]))
    store.dispatch(toggleMeshOverlay())
    store.dispatch(toggleVectors())

    const state = store.getState()
    expect(state.femSolver.selectedField).toBe('electric_potential')
    expect(state.femSolver.displayMode).toBe('contour')
    expect(state.femSolver.colorMap).toBe('jet')
    expect(state.femSolver.colorRange).toEqual([0, 100])
    expect(state.femSolver.showMeshOverlay).toBe(false) // toggled
    expect(state.femSolver.showVectors).toBe(true) // toggled
  })

  it('step 6: line plot data → stored and retrievable', () => {
    store.dispatch(
      addLinePlot({
        id: 'lp1',
        name: 'Potential along y',
        fieldName: 'electric_potential',
        startPoint: [0.5, 0],
        endPoint: [0.5, 1],
        numPoints: 5,
      })
    )
    store.dispatch(
      setLinePlotData({
        id: 'lp1',
        data: {
          arcLength: [0, 0.25, 0.5, 0.75, 1.0],
          values: [0, 25, 50, 75, 100],
        },
      })
    )

    const state = store.getState()
    expect(state.femSolver.linePlots).toHaveLength(1)
    expect(state.femSolver.linePlotData['lp1'].values).toEqual(
      [0, 25, 50, 75, 100]
    )
  })

  it('step 7: point probe → stored and retrievable', () => {
    store.dispatch(
      addProbe({ id: 'p1', name: 'Center', x: 0.5, y: 0.5 })
    )
    store.dispatch(
      setProbeResult({
        id: 'p1',
        result: {
          fieldName: 'electric_potential',
          value: 50.0,
          unit: 'V',
        },
      })
    )

    const state = store.getState()
    expect(state.femSolver.probes).toHaveLength(1)
    expect(state.femSolver.probeResults['p1'].value).toBe(50.0)
  })

  it('clear solve result resets all state', () => {
    store.dispatch(setSolveResult(plateCapacitorResult))
    store.dispatch(setSelectedField('electric_potential'))

    store.dispatch(clearSolveResult())

    const state = store.getState()
    expect(state.femSolver.solveStatus).toBe('idle')
    expect(state.femSolver.result).toBeNull()
    expect(state.femSolver.selectedField).toBeNull()
  })

  it('solve error is handled correctly', async () => {
    store.dispatch(setMesh(plateCapacitorMesh))
    const { solveFEM } = await import('@/api/femSolver')
    vi.mocked(solveFEM).mockRejectedValue(new Error('Singular matrix'))

    await store.dispatch(runFEMSolve())

    const state = store.getState()
    expect(state.femSolver.solveStatus).toBe('error')
    expect(state.femSolver.error).toBe('Singular matrix')
  })

  it('geometry change marks results stale', () => {
    store.dispatch(setSolveResult(plateCapacitorResult))
    store.dispatch(clearStale())

    // Change geometry → results should be stale
    store.dispatch(
      addGeometryOperation({
        type: 'add_circle',
        params: { cx: 0.5, cy: 0.5, radius: 0.3 },
      })
    )

    const state = store.getState()
    expect(state.femDesign.resultsStale).toBe(true)
    expect(state.femDesign.meshStale).toBe(true)
  })
})
