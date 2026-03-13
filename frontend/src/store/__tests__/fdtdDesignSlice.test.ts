import { configureStore } from '@reduxjs/toolkit'
import fdtdDesignReducer, {
  setDimensionality,
  setDomainSize,
  setCellSize,
  addStructure,
  removeStructure,
  updateStructure,
  addSource,
  removeSource,
  addProbe,
  removeProbe,
  setBoundaries,
  setConfig,
  resetDesign,
  markClean,
} from '../fdtdDesignSlice'
import { describe, it, expect, beforeEach } from 'vitest'

type TestRootState = {
  fdtdDesign: ReturnType<typeof fdtdDesignReducer>
}

describe('fdtdDesignSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>

  beforeEach(() => {
    store = configureStore({
      reducer: { fdtdDesign: fdtdDesignReducer },
    })
  })

  // ============================================================================
  // INITIAL STATE
  // ============================================================================

  it('should have correct initial state', () => {
    const state = store.getState().fdtdDesign
    expect(state.dimensionality).toBe('1d')
    expect(state.domainSize).toEqual([1.0, 0.01, 0.01])
    expect(state.cellSize).toEqual([0.005, 0.01, 0.01])
    expect(state.structures).toEqual([])
    expect(state.sources).toEqual([])
    expect(state.probes).toEqual([])
    expect(state.meshInfo).toBeNull()
    expect(state.validation).toBeNull()
    expect(state.meshStatus).toBe('idle')
    expect(state.isDirty).toBe(true)
  })

  // ============================================================================
  // DIMENSIONALITY
  // ============================================================================

  it('setDimensionality should update dimensionality and mark dirty', () => {
    store.dispatch(markClean())
    expect(store.getState().fdtdDesign.isDirty).toBe(false)

    store.dispatch(setDimensionality('2d'))
    const state = store.getState().fdtdDesign
    expect(state.dimensionality).toBe('2d')
    expect(state.isDirty).toBe(true)
  })

  // ============================================================================
  // DOMAIN / CELL SIZE
  // ============================================================================

  it('setDomainSize should update domain size', () => {
    store.dispatch(setDomainSize([2.0, 1.0, 0.5]))
    expect(store.getState().fdtdDesign.domainSize).toEqual([2.0, 1.0, 0.5])
  })

  it('setCellSize should update cell size', () => {
    store.dispatch(setCellSize([0.01, 0.01, 0.01]))
    expect(store.getState().fdtdDesign.cellSize).toEqual([0.01, 0.01, 0.01])
  })

  // ============================================================================
  // STRUCTURES
  // ============================================================================

  it('addStructure should add with auto-generated ID', () => {
    store.dispatch(
      addStructure({
        name: 'Test Box',
        type: 'box',
        position: [0.1, 0.1, 0.0],
        dimensions: { size_x: 0.05, size_y: 0.05, size_z: 0.01 },
        material: 'copper',
      }),
    )
    const state = store.getState().fdtdDesign
    expect(state.structures).toHaveLength(1)
    expect(state.structures[0].name).toBe('Test Box')
    expect(state.structures[0].type).toBe('box')
    expect(state.structures[0].id).toBeDefined()
    expect(state.structures[0].id.length).toBeGreaterThan(0)
  })

  it('removeStructure should remove by ID', () => {
    store.dispatch(
      addStructure({
        name: 'S1',
        type: 'box',
        position: [0, 0, 0],
        dimensions: {},
        material: 'air',
      }),
    )
    store.dispatch(
      addStructure({
        name: 'S2',
        type: 'cylinder',
        position: [0, 0, 0],
        dimensions: {},
        material: 'copper',
      }),
    )
    const structures = store.getState().fdtdDesign.structures
    expect(structures).toHaveLength(2)

    store.dispatch(removeStructure(structures[0].id))
    const updated = store.getState().fdtdDesign.structures
    expect(updated).toHaveLength(1)
    expect(updated[0].name).toBe('S2')
  })

  it('updateStructure should replace matching structure', () => {
    store.dispatch(
      addStructure({
        name: 'Original',
        type: 'box',
        position: [0, 0, 0],
        dimensions: {},
        material: 'air',
      }),
    )
    const id = store.getState().fdtdDesign.structures[0].id

    store.dispatch(
      updateStructure({
        id,
        name: 'Updated',
        type: 'sphere',
        position: [1, 1, 1],
        dimensions: { radius: 0.1 },
        material: 'fr4',
      }),
    )
    const s = store.getState().fdtdDesign.structures[0]
    expect(s.name).toBe('Updated')
    expect(s.type).toBe('sphere')
    expect(s.material).toBe('fr4')
  })

  // ============================================================================
  // SOURCES
  // ============================================================================

  it('addSource should add with auto-generated ID', () => {
    store.dispatch(
      addSource({
        name: 'Gaussian',
        type: 'gaussian_pulse',
        position: [0.5, 0.0, 0.0],
        parameters: { amplitude: 1.0, width: 30 },
        polarization: 'z',
      }),
    )
    const state = store.getState().fdtdDesign
    expect(state.sources).toHaveLength(1)
    expect(state.sources[0].name).toBe('Gaussian')
    expect(state.sources[0].id).toBeDefined()
  })

  it('removeSource should remove by ID', () => {
    store.dispatch(
      addSource({
        name: 'S1',
        type: 'sinusoidal',
        position: [0, 0, 0],
        parameters: {},
        polarization: 'z',
      }),
    )
    const id = store.getState().fdtdDesign.sources[0].id
    store.dispatch(removeSource(id))
    expect(store.getState().fdtdDesign.sources).toHaveLength(0)
  })

  // ============================================================================
  // PROBES
  // ============================================================================

  it('addProbe should add with auto-generated ID', () => {
    store.dispatch(
      addProbe({
        name: 'Observation',
        type: 'point',
        position: [0.3, 0.0, 0.0],
        fields: ['Ez'],
      }),
    )
    const state = store.getState().fdtdDesign
    expect(state.probes).toHaveLength(1)
    expect(state.probes[0].name).toBe('Observation')
  })

  it('removeProbe should remove by ID', () => {
    store.dispatch(
      addProbe({
        name: 'P1',
        type: 'point',
        position: [0, 0, 0],
        fields: ['Ez'],
      }),
    )
    const id = store.getState().fdtdDesign.probes[0].id
    store.dispatch(removeProbe(id))
    expect(store.getState().fdtdDesign.probes).toHaveLength(0)
  })

  // ============================================================================
  // BOUNDARIES
  // ============================================================================

  it('setBoundaries should update all faces', () => {
    const pecAll = {
      x_min: { type: 'pec' as const },
      x_max: { type: 'pec' as const },
      y_min: { type: 'pec' as const },
      y_max: { type: 'pec' as const },
      z_min: { type: 'pec' as const },
      z_max: { type: 'pec' as const },
    }
    store.dispatch(setBoundaries(pecAll))
    const state = store.getState().fdtdDesign
    expect(state.boundaries.x_min.type).toBe('pec')
    expect(state.boundaries.z_max.type).toBe('pec')
  })

  // ============================================================================
  // CONFIG
  // ============================================================================

  it('setConfig should merge partial config', () => {
    store.dispatch(setConfig({ num_time_steps: 2000 }))
    const state = store.getState().fdtdDesign
    expect(state.config.num_time_steps).toBe(2000)
    // Other config values should remain
    expect(state.config.courant_number).toBe(0.99)
  })

  // ============================================================================
  // RESET / CLEAN
  // ============================================================================

  it('resetDesign should restore initial state', () => {
    store.dispatch(setDimensionality('2d'))
    store.dispatch(setDomainSize([5, 5, 5]))
    store.dispatch(
      addStructure({
        name: 'X',
        type: 'box',
        position: [0, 0, 0],
        dimensions: {},
        material: 'air',
      }),
    )

    store.dispatch(resetDesign())
    const state = store.getState().fdtdDesign
    expect(state.dimensionality).toBe('1d')
    expect(state.domainSize).toEqual([1.0, 0.01, 0.01])
    expect(state.structures).toEqual([])
  })

  it('markClean should set isDirty to false', () => {
    expect(store.getState().fdtdDesign.isDirty).toBe(true)
    store.dispatch(markClean())
    expect(store.getState().fdtdDesign.isDirty).toBe(false)
  })

  it('any design change after markClean should set isDirty', () => {
    store.dispatch(markClean())
    expect(store.getState().fdtdDesign.isDirty).toBe(false)
    store.dispatch(setCellSize([0.01, 0.01, 0.01]))
    expect(store.getState().fdtdDesign.isDirty).toBe(true)
  })
})
