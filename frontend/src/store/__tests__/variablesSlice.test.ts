import { describe, it, expect } from 'vitest'
import variablesReducer, {
  addVariable,
  removeVariable,
  updateVariable,
  setVariables,
  resetVariables,
  selectVariableContextNumeric,
  selectEvaluatedVariables,
} from '@/store/variablesSlice'
import type { RootState } from '@/store/store'

/** Build a minimal RootState with just the variables slice populated. */
function makeState(variables: { name: string; expression: string }[]): RootState {
  return {
    variables: {
      variables: variables.map((v) => ({
        ...v,
        unit: '',
        description: '',
      })),
    },
  } as unknown as RootState
}

describe('variablesSlice reducers', () => {
  it('adds a variable', () => {
    const initial = variablesReducer(undefined, { type: '@@init' })
    const next = variablesReducer(
      initial,
      addVariable({ name: 'x', expression: '10', unit: 'm', description: '' })
    )
    expect(next.variables.length).toBe(initial.variables.length + 1)
    expect(next.variables[next.variables.length - 1].name).toBe('x')
  })

  it('removes a variable by index', () => {
    const initial = variablesReducer(undefined, { type: '@@init' })
    const next = variablesReducer(initial, removeVariable(0))
    expect(next.variables.length).toBe(initial.variables.length - 1)
  })

  it('updates a variable', () => {
    const initial = variablesReducer(undefined, { type: '@@init' })
    const next = variablesReducer(
      initial,
      updateVariable({ index: 0, variable: { expression: '500e6' } })
    )
    expect(next.variables[0].expression).toBe('500e6')
  })

  it('setVariables replaces all', () => {
    const next = variablesReducer(
      undefined,
      setVariables([{ name: 'a', expression: '1', unit: '', description: '' }])
    )
    expect(next.variables).toHaveLength(1)
    expect(next.variables[0].name).toBe('a')
  })

  it('resetVariables restores defaults', () => {
    const custom = variablesReducer(
      undefined,
      setVariables([{ name: 'a', expression: '1', unit: '', description: '' }])
    )
    const reset = variablesReducer(custom, resetVariables())
    expect(reset.variables.length).toBeGreaterThan(1)
    expect(reset.variables[0].name).toBe('freq')
  })
})

describe('memoized selectors', () => {
  it('selectVariableContextNumeric returns same reference for same input', () => {
    const state = makeState([{ name: 'x', expression: '42' }])
    const r1 = selectVariableContextNumeric(state)
    const r2 = selectVariableContextNumeric(state)
    expect(r1).toBe(r2) // referential equality = memoized
  })

  it('selectVariableContextNumeric includes evaluated variable', () => {
    const state = makeState([{ name: 'x', expression: '42' }])
    const ctx = selectVariableContextNumeric(state)
    expect(ctx['x']).toBe(42)
  })

  it('selectEvaluatedVariables returns same reference for same input', () => {
    const state = makeState([{ name: 'x', expression: '42' }])
    const r1 = selectEvaluatedVariables(state)
    const r2 = selectEvaluatedVariables(state)
    expect(r1).toBe(r2)
  })
})
