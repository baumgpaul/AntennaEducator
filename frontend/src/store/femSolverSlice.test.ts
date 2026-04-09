/**
 * Tests for femSolverSlice — config, solve lifecycle, postprocessing view.
 */

import { configureStore } from '@reduxjs/toolkit'
import femSolverReducer, {
  setFEMSolverConfig,
  setSolving,
  setSolveProgress,
  setSolveResult,
  setSolveError,
  clearSolveResult,
  setSelectedField,
  setDisplayMode,
  setColorMap,
  toggleMeshOverlay,
  toggleVectors,
  addLinePlot,
  removeLinePlot,
  addProbe,
  removeProbe,
  resetFEMSolver,
  selectFEMSolverConfig,
  selectFEMSolveStatus,
  selectFEMSolveResult,
  selectFEMSelectedField,
  selectFEMDisplayMode,
  type FEMSolverState,
} from './femSolverSlice'

function createTestStore(preloadedState?: { femSolver: FEMSolverState }) {
  return configureStore({
    reducer: { femSolver: femSolverReducer },
    preloadedState,
  })
}

describe('femSolverSlice', () => {
  describe('config', () => {
    it('should update solver config partially', () => {
      const store = createTestStore()

      store.dispatch(setFEMSolverConfig({ linearSolver: 'cg', tolerance: 1e-10 }))

      const config = selectFEMSolverConfig(store.getState())
      expect(config.linearSolver).toBe('cg')
      expect(config.tolerance).toBe(1e-10)
      // Unchanged defaults
      expect(config.analysisType).toBe('static')
    })
  })

  describe('solve lifecycle', () => {
    it('should transition to solving state', () => {
      const store = createTestStore()

      store.dispatch(setSolving('Assembling stiffness matrix...'))

      expect(selectFEMSolveStatus(store.getState())).toBe('solving')
      expect(store.getState().femSolver.solveProgress).toBe('Assembling stiffness matrix...')
    })

    it('should update solve progress', () => {
      const store = createTestStore()
      store.dispatch(setSolving('Assembling...'))

      store.dispatch(setSolveProgress('Solving (1,200 DOFs)...'))

      expect(store.getState().femSolver.solveProgress).toBe('Solving (1,200 DOFs)...')
    })

    it('should set solve result and auto-select first field', () => {
      const store = createTestStore()
      store.dispatch(setSolving('Solving...'))

      const result = {
        scalarFields: [{ name: 'potential', values: [0, 1, 2], unit: 'V', min: 0, max: 2 }],
        vectorFields: [],
        integralQuantities: [{ name: 'energy', value: 1.5e-12, unit: 'J' }],
        solveTimeMs: 42,
        nDofs: 100,
      }
      store.dispatch(setSolveResult(result))

      expect(selectFEMSolveStatus(store.getState())).toBe('done')
      expect(selectFEMSolveResult(store.getState())).toBeDefined()
      expect(selectFEMSelectedField(store.getState())).toBe('potential')
    })

    it('should set solve error', () => {
      const store = createTestStore()
      store.dispatch(setSolving('Solving...'))

      store.dispatch(setSolveError('Singular matrix'))

      expect(selectFEMSolveStatus(store.getState())).toBe('error')
      expect(store.getState().femSolver.error).toBe('Singular matrix')
    })

    it('should clear solve result', () => {
      const store = createTestStore()
      store.dispatch(setSolveResult({
        scalarFields: [{ name: 'potential', values: [], unit: 'V', min: 0, max: 0 }],
        vectorFields: [], integralQuantities: [], solveTimeMs: 10, nDofs: 50,
      }))

      store.dispatch(clearSolveResult())

      expect(selectFEMSolveStatus(store.getState())).toBe('idle')
      expect(selectFEMSolveResult(store.getState())).toBeNull()
      expect(selectFEMSelectedField(store.getState())).toBeNull()
    })
  })

  describe('postprocessing view', () => {
    it('should set selected field', () => {
      const store = createTestStore()

      store.dispatch(setSelectedField('e_field'))

      expect(selectFEMSelectedField(store.getState())).toBe('e_field')
    })

    it('should set display mode', () => {
      const store = createTestStore()

      store.dispatch(setDisplayMode('both'))

      expect(selectFEMDisplayMode(store.getState())).toBe('both')
    })

    it('should set color map', () => {
      const store = createTestStore()

      store.dispatch(setColorMap('jet'))

      expect(store.getState().femSolver.colorMap).toBe('jet')
    })

    it('should toggle mesh overlay', () => {
      const store = createTestStore()
      expect(store.getState().femSolver.showMeshOverlay).toBe(true)

      store.dispatch(toggleMeshOverlay())

      expect(store.getState().femSolver.showMeshOverlay).toBe(false)
    })

    it('should toggle vectors', () => {
      const store = createTestStore()
      expect(store.getState().femSolver.showVectors).toBe(false)

      store.dispatch(toggleVectors())

      expect(store.getState().femSolver.showVectors).toBe(true)
    })
  })

  describe('line plots', () => {
    it('should add and remove line plots', () => {
      const store = createTestStore()
      const lp = {
        id: 'lp1',
        startPoint: [0, 0] as [number, number],
        endPoint: [1, 0] as [number, number],
        fieldName: 'potential',
        nPoints: 50,
      }

      store.dispatch(addLinePlot(lp))
      expect(store.getState().femSolver.linePlots).toHaveLength(1)

      store.dispatch(removeLinePlot('lp1'))
      expect(store.getState().femSolver.linePlots).toHaveLength(0)
    })
  })

  describe('point probes', () => {
    it('should add and remove probes', () => {
      const store = createTestStore()
      const probe = { id: 'p1', x: 0.5, y: 0.5 }

      store.dispatch(addProbe(probe))
      expect(store.getState().femSolver.probes).toHaveLength(1)

      store.dispatch(removeProbe('p1'))
      expect(store.getState().femSolver.probes).toHaveLength(0)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      const store = createTestStore()
      store.dispatch(setFEMSolverConfig({ linearSolver: 'gmres' }))
      store.dispatch(setSolving('Working...'))

      store.dispatch(resetFEMSolver())

      expect(selectFEMSolveStatus(store.getState())).toBe('idle')
      expect(selectFEMSolverConfig(store.getState()).linearSolver).toBe('direct')
    })
  })
})
