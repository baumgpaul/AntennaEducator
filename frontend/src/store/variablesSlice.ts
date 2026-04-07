/**
 * Variables slice — manages named variables and expression evaluation.
 *
 * Variables are evaluated top-down (order matters). Each variable
 * can reference built-in constants and previously defined variables.
 */

import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from './store'
import {
  evaluateVariableContext,
  evaluateVariableContextNumeric,
  type VariableDefinition,
} from '@/utils/expressionEvaluator'

interface VariablesState {
  /** Ordered list of user-defined variables. */
  variables: VariableDefinition[]
}

const initialState: VariablesState = {
  variables: [
    {
      name: 'freq',
      expression: '300e6',
      unit: 'Hz',
      description: 'Operating frequency (300 MHz default)',
    },
    {
      name: 'wavelength',
      expression: 'C_0 / freq',
      unit: 'm',
      description: 'Wavelength at operating frequency',
    },
  ],
}

const variablesSlice = createSlice({
  name: 'variables',
  initialState,
  reducers: {
    addVariable(state, action: PayloadAction<VariableDefinition>) {
      state.variables.push(action.payload)
    },

    updateVariable(
      state,
      action: PayloadAction<{ index: number; variable: Partial<VariableDefinition> }>
    ) {
      const { index, variable } = action.payload
      if (index >= 0 && index < state.variables.length) {
        state.variables[index] = { ...state.variables[index], ...variable }
      }
    },

    removeVariable(state, action: PayloadAction<number>) {
      const index = action.payload
      if (index >= 0 && index < state.variables.length) {
        state.variables.splice(index, 1)
      }
    },

    setVariables(state, action: PayloadAction<VariableDefinition[]>) {
      state.variables = action.payload
    },

    /** Reset to default variables (freq + wavelength). */
    resetVariables(state) {
      state.variables = initialState.variables
    },
  },
})

export const {
  addVariable,
  updateVariable,
  removeVariable,
  setVariables,
  resetVariables,
} = variablesSlice.actions

// --- Selectors ---

/** Raw variable definitions. */
export const selectVariables = (state: RootState) => state.variables.variables

/**
 * Evaluated variable context: name → value or error string.
 * Includes error messages for failed variables.
 */
export const selectEvaluatedVariables = createSelector(
  [(state: RootState) => state.variables.variables],
  (vars) => evaluateVariableContext(vars)
)

/**
 * Numeric-only evaluated context: name → number.
 * Only includes successfully evaluated variables.
 * Used to build the context dict for ExpressionField resolution.
 */
export const selectVariableContextNumeric = createSelector(
  [(state: RootState) => state.variables.variables],
  (vars) => evaluateVariableContextNumeric(vars)
)

export default variablesSlice.reducer
