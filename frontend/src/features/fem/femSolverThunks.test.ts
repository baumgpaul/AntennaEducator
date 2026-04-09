/**
 * Tests for FEM solver thunks — async thunk logic tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import femDesignReducer from '@/store/femDesignSlice'
import femSolverReducer from '@/store/femSolverSlice'
import { runFEMSolve } from '@/store/femSolverThunks'
import type { FEMMesh } from '@/types/femMesh'
import type { FEMSolverResult } from '@/types/femSolver'

// Mock the API module
vi.mock('@/api/femSolver', () => ({
  solveFEM: vi.fn(),
}))

vi.mock('@/api/femPostprocessor', () => ({
  getFieldVisualization: vi.fn(),
  getLinePlotData: vi.fn(),
  getPointProbe: vi.fn(),
}))

function createTestStore(meshOverride?: FEMMesh | null) {
  const store = configureStore({
    reducer: {
      femDesign: femDesignReducer,
      femSolver: femSolverReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  })

  // Optionally set mesh
  if (meshOverride) {
    store.dispatch({
      type: 'femDesign/setMesh',
      payload: meshOverride,
    })
  }

  return store
}

const mockMesh: FEMMesh = {
  dimension: 2,
  nodes: [
    { id: 0, coords: [0, 0] },
    { id: 1, coords: [1, 0] },
    { id: 2, coords: [0.5, 1] },
  ],
  elements: [
    { id: 0, elementType: 'tri3', nodeIds: [0, 1, 2], regionId: 0 },
  ],
  regions: [{ id: 0, name: 'domain', materialId: null }],
  boundaryEdges: [],
  elementType: 'tri3',
  metadata: {},
}

const mockResult: FEMSolverResult = {
  scalarFields: [
    { name: 'potential', values: [0, 1, 0.5], unit: 'V', min: 0, max: 1 },
  ],
  vectorFields: [],
  integralQuantities: [
    { name: 'energy', value: 4.42e-11, unit: 'J' },
  ],
  solveTimeMs: 15,
  nDofs: 3,
}

describe('runFEMSolve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects when no mesh is available', async () => {
    const store = createTestStore()

    const result = await store.dispatch(runFEMSolve())
    expect(result.type).toBe('femSolver/runSolve/rejected')
  })

  it('sets solving status on dispatch', async () => {
    const { solveFEM } = await import('@/api/femSolver')
    vi.mocked(solveFEM).mockResolvedValue(mockResult)

    const store = createTestStore(mockMesh)
    const promise = store.dispatch(runFEMSolve())

    // Status should be solving during the request
    const midState = store.getState()
    expect(midState.femSolver.solveStatus).toBe('solving')

    await promise
  })

  it('dispatches setSolveResult on success', async () => {
    const { solveFEM } = await import('@/api/femSolver')
    vi.mocked(solveFEM).mockResolvedValue(mockResult)

    const store = createTestStore(mockMesh)
    await store.dispatch(runFEMSolve())

    const state = store.getState()
    expect(state.femSolver.solveStatus).toBe('done')
    expect(state.femSolver.result).toEqual(mockResult)
    expect(state.femSolver.selectedField).toBe('potential')
    expect(state.femDesign.resultsStale).toBe(false)
  })

  it('dispatches setSolveError on failure', async () => {
    const { solveFEM } = await import('@/api/femSolver')
    vi.mocked(solveFEM).mockRejectedValue(new Error('Server error'))

    const store = createTestStore(mockMesh)
    await store.dispatch(runFEMSolve())

    const state = store.getState()
    expect(state.femSolver.solveStatus).toBe('error')
    expect(state.femSolver.error).toBe('Server error')
  })

  it('calls solveFEM with correct parameters', async () => {
    const { solveFEM } = await import('@/api/femSolver')
    vi.mocked(solveFEM).mockResolvedValue(mockResult)

    const store = createTestStore(mockMesh)
    await store.dispatch(runFEMSolve())

    expect(solveFEM).toHaveBeenCalledTimes(1)
    const args = vi.mocked(solveFEM).mock.calls[0]
    expect(args[0]).toBe(mockMesh)
    expect(args[1]).toBe('electrostatic') // default PDE type
  })
})
