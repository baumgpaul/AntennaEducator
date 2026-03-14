import { configureStore } from '@reduxjs/toolkit'
import fdtdSolverReducer, {
  setMode,
  setProgress,
  clearResults,
} from '../fdtdSolverSlice'
import type { FdtdSimulationStatus } from '../fdtdSolverSlice'
import { describe, it, expect, beforeEach } from 'vitest'

type TestRootState = {
  fdtdSolver: ReturnType<typeof fdtdSolverReducer>
}

describe('fdtdSolverSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>

  beforeEach(() => {
    store = configureStore({
      reducer: { fdtdSolver: fdtdSolverReducer },
    })
  })

  // ============================================================================
  // INITIAL STATE
  // ============================================================================

  it('should have correct initial state', () => {
    const state = store.getState().fdtdSolver
    expect(state.status).toBe('idle')
    expect(state.progress).toBe(0)
    expect(state.error).toBeNull()
    expect(state.results).toBeNull()
    expect(state.fieldSnapshot).toBeNull()
    expect(state.poynting).toBeNull()
    expect(state.mode).toBe('tm')
  })

  // ============================================================================
  // MODE
  // ============================================================================

  it('setMode should switch between TM and TE', () => {
    store.dispatch(setMode('te'))
    expect(store.getState().fdtdSolver.mode).toBe('te')

    store.dispatch(setMode('tm'))
    expect(store.getState().fdtdSolver.mode).toBe('tm')
  })

  // ============================================================================
  // PROGRESS
  // ============================================================================

  it('setProgress should update progress value', () => {
    store.dispatch(setProgress(50))
    expect(store.getState().fdtdSolver.progress).toBe(50)

    store.dispatch(setProgress(100))
    expect(store.getState().fdtdSolver.progress).toBe(100)
  })

  // ============================================================================
  // CLEAR RESULTS
  // ============================================================================

  it('clearResults should reset all result state', () => {
    // First set some progress to verify it gets cleared
    store.dispatch(setProgress(75))
    store.dispatch(setMode('te'))

    store.dispatch(clearResults())
    const state = store.getState().fdtdSolver
    expect(state.results).toBeNull()
    expect(state.fieldSnapshot).toBeNull()
    expect(state.poynting).toBeNull()
    expect(state.status).toBe('idle')
    expect(state.error).toBeNull()
    expect(state.progress).toBe(0)
    // Mode should NOT be reset by clearResults
    expect(state.mode).toBe('te')
  })

  // ============================================================================
  // ASYNC THUNK STATES (via direct action dispatch)
  // ============================================================================

  it('runFdtdSimulation.pending should set status to solving', () => {
    // Dispatch the pending action directly
    store.dispatch({ type: 'fdtdSolver/run/pending' })
    const state = store.getState().fdtdSolver
    expect(state.status).toBe('solving')
    expect(state.progress).toBe(0)
    expect(state.error).toBeNull()
  })

  it('runFdtdSimulation.fulfilled should set status to completed', () => {
    const mockResult = {
      dimensionality: '1d',
      mode: 'tm',
      total_time_steps: 500,
      dt: 1.67e-11,
      solve_time_s: 0.5,
      fields_final: { Ez: [0.0, 0.1, 0.5, 0.1, 0.0], Hy: [0.0, 0.05, 0.25, 0.05, 0.0] },
      probe_data: [],
      dft_results: [],
    }

    store.dispatch({ type: 'fdtdSolver/run/fulfilled', payload: mockResult })
    const state = store.getState().fdtdSolver
    expect(state.status).toBe('completed')
    expect(state.progress).toBe(100)
    expect(state.results).toEqual(mockResult)
  })

  it('runFdtdSimulation.rejected should set status to failed', () => {
    store.dispatch({
      type: 'fdtdSolver/run/rejected',
      error: { message: 'Solver timeout' },
    })
    const state = store.getState().fdtdSolver
    expect(state.status).toBe('failed')
    expect(state.error).toBe('Solver timeout')
  })

  it('extractFdtdField.fulfilled should store field snapshot', () => {
    const mockSnapshot = {
      field_component: 'Ez',
      values: [0.0, 0.5, 1.0, 0.5, 0.0],
      x_coords: [0.0, 0.005, 0.01, 0.015, 0.02],
      y_coords: [],
      min_value: 0.0,
      max_value: 1.0,
    }

    store.dispatch({ type: 'fdtdSolver/extractField/fulfilled', payload: mockSnapshot })
    const state = store.getState().fdtdSolver
    expect(state.fieldSnapshot).toEqual(mockSnapshot)
  })

  it('computeFdtdPoynting.fulfilled should store poynting result', () => {
    const mockPoynting = {
      sx: [],
      sy: [],
      sz: [],
      magnitude: [0.1, 0.5, 0.1],
      total_power: 0.7,
    }

    store.dispatch({ type: 'fdtdSolver/computePoynting/fulfilled', payload: mockPoynting })
    const state = store.getState().fdtdSolver
    expect(state.poynting).toEqual(mockPoynting)
  })
})
