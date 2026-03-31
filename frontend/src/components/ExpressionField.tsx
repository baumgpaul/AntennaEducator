/**
 * ExpressionField — a TextField that accepts both numbers and expressions.
 *
 * Resolves the expression against the variable context and shows
 * the evaluated value as helperText. Supports validation via a
 * constraint function (e.g., "must be positive").
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { TextField, type TextFieldProps } from '@mui/material'
import { useAppSelector } from '@/store/hooks'
import { selectVariableContextNumeric } from '@/store/variablesSlice'
import {
  evaluateExpression,
  ExpressionError,
  BUILTIN_CONSTANTS,
  formatValue,
} from '@/utils/expressionEvaluator'

export interface ExpressionFieldProps
  extends Omit<TextFieldProps, 'value' | 'onChange' | 'error' | 'helperText'> {
  /** Current value — number or expression string. */
  value: number | string
  /** Called when value changes (always a string — the raw input). */
  onChange: (value: string) => void
  /** Optional validation: return error message or null if valid. */
  validate?: (numericValue: number) => string | null
  /** Unit suffix shown after the resolved value. */
  unit?: string
  /** If true, disallow expression input (pure numeric). */
  numericOnly?: boolean
}

export default function ExpressionField({
  value,
  onChange,
  validate,
  unit,
  numericOnly = false,
  ...textFieldProps
}: ExpressionFieldProps) {
  const variableContext = useAppSelector(selectVariableContextNumeric)
  const [localValue, setLocalValue] = useState<string>(String(value))

  // Sync from parent when value prop changes externally
  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  const allContext = useMemo(
    () => ({ ...BUILTIN_CONSTANTS, ...variableContext }),
    [variableContext]
  )

  const { resolved, error } = useMemo(() => {
    const trimmed = localValue.trim()
    if (!trimmed) return { resolved: null, error: 'Required' }

    // Try as plain number first
    const num = Number(trimmed)
    if (!Number.isNaN(num) && trimmed !== '') {
      const validationErr = validate?.(num) ?? null
      return { resolved: num, error: validationErr }
    }

    if (numericOnly) {
      return { resolved: null, error: 'Must be a number' }
    }

    // Try as expression
    try {
      const result = evaluateExpression(trimmed, allContext)
      const validationErr = validate?.(result) ?? null
      return { resolved: result, error: validationErr }
    } catch (e) {
      const msg =
        e instanceof ExpressionError
          ? e.message.replace(/^Expression '.*?': /, '')
          : 'Invalid expression'
      return { resolved: null, error: msg }
    }
  }, [localValue, allContext, validate, numericOnly])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setLocalValue(raw)
      onChange(raw)
    },
    [onChange]
  )

  // Build helperText: show resolved value or error
  const helperText = useMemo(() => {
    if (error) return error
    if (resolved !== null) {
      // Only show resolved value if input is an expression (not a plain number)
      const trimmed = localValue.trim()
      const isPlainNumber = !Number.isNaN(Number(trimmed)) && trimmed !== ''
      if (isPlainNumber) return unit ? `${formatValue(resolved)} ${unit}` : undefined
      return unit
        ? `= ${formatValue(resolved)} ${unit}`
        : `= ${formatValue(resolved)}`
    }
    return undefined
  }, [error, resolved, localValue, unit])

  return (
    <TextField
      {...textFieldProps}
      value={localValue}
      onChange={handleChange}
      error={!!error}
      helperText={helperText}
    />
  )
}

/**
 * Hook to resolve an expression value using the current variable context.
 * Returns { value: number | null, error: string | null }.
 */
export function useResolvedExpression(expression: string | number) {
  const variableContext = useAppSelector(selectVariableContextNumeric)

  return useMemo(() => {
    if (typeof expression === 'number') {
      return { value: expression, error: null }
    }

    const trimmed = String(expression).trim()
    if (!trimmed) return { value: null, error: 'Empty' }

    // Try plain number
    const num = Number(trimmed)
    if (!Number.isNaN(num)) return { value: num, error: null }

    // Try expression
    try {
      const allContext = { ...BUILTIN_CONSTANTS, ...variableContext }
      const result = evaluateExpression(trimmed, allContext)
      return { value: result, error: null }
    } catch (e) {
      const msg =
        e instanceof ExpressionError
          ? e.message.replace(/^Expression '.*?': /, '')
          : 'Invalid expression'
      return { value: null, error: msg }
    }
  }, [expression, variableContext])
}
