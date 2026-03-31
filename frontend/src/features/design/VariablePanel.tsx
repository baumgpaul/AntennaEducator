/**
 * VariablePanel — collapsible sidebar section for managing named variables.
 *
 * Shows built-in constants (read-only) and user-defined variables
 * with inline editing of name, expression, unit, and description.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Tooltip,
  Chip,
  Divider,
} from '@mui/material'
import {
  ExpandMore,
  Add as AddIcon,
  Delete as DeleteIcon,
  Functions as FunctionsIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  selectVariables,
  selectEvaluatedVariables,
  addVariable,
  updateVariable,
  removeVariable,
} from '@/store/variablesSlice'
import {
  BUILTIN_CONSTANTS,
  formatValue,
  type VariableDefinition,
} from '@/utils/expressionEvaluator'

// Built-in constants displayed as read-only rows
const DISPLAYED_CONSTANTS: Array<{
  name: string
  value: number
  unit: string
  description: string
}> = [
  { name: 'C_0', value: BUILTIN_CONSTANTS.C_0, unit: 'm/s', description: 'Speed of light' },
  { name: 'MU_0', value: BUILTIN_CONSTANTS.MU_0, unit: 'H/m', description: 'Permeability of free space' },
  { name: 'EPSILON_0', value: BUILTIN_CONSTANTS.EPSILON_0, unit: 'F/m', description: 'Permittivity of free space' },
  { name: 'Z_0', value: BUILTIN_CONSTANTS.Z_0, unit: 'Ω', description: 'Free space impedance' },
  { name: 'pi', value: BUILTIN_CONSTANTS.pi, unit: '', description: 'π ≈ 3.14159' },
]

/** Compact cell styling */
const cellSx = { py: 0.25, px: 0.5, border: 'none' } as const
const inputSx = { '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5, px: 0.5 } } as const

export default function VariablePanel() {
  const dispatch = useAppDispatch()
  const variables = useAppSelector(selectVariables)
  const evaluated = useAppSelector(selectEvaluatedVariables)
  const [constantsExpanded, setConstantsExpanded] = useState(false)

  const handleAdd = useCallback(() => {
    // Generate a unique default name
    const existingNames = new Set(variables.map((v) => v.name))
    let idx = 1
    let name = 'var1'
    while (existingNames.has(name)) {
      idx++
      name = `var${idx}`
    }
    dispatch(
      addVariable({
        name,
        expression: '0',
        unit: null,
        description: null,
      })
    )
  }, [dispatch, variables])

  const handleUpdate = useCallback(
    (index: number, partial: Partial<VariableDefinition>) => {
      dispatch(updateVariable({ index, variable: partial }))
    },
    [dispatch]
  )

  const handleRemove = useCallback(
    (index: number) => {
      dispatch(removeVariable(index))
    },
    [dispatch]
  )

  return (
    <Box>
      {/* Built-in Constants (collapsed by default) */}
      <Accordion
        expanded={constantsExpanded}
        onChange={(_, exp) => setConstantsExpanded(exp)}
        disableGutters
        elevation={0}
        sx={{ '&:before': { display: 'none' }, bgcolor: 'transparent' }}
      >
        <AccordionSummary expandIcon={<ExpandMore sx={{ fontSize: '1rem' }} />} sx={{ minHeight: 28, '& .MuiAccordionSummary-content': { my: 0.25 } }}>
          <Typography variant="caption" color="text.secondary">
            Constants
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          <Table size="small">
            <TableBody>
              {DISPLAYED_CONSTANTS.map((c) => (
                <TableRow key={c.name} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                  <TableCell sx={cellSx}>
                    <Tooltip title={c.description}>
                      <Typography variant="caption" fontFamily="monospace" fontWeight={600} color="text.secondary">
                        {c.name}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={cellSx} align="right">
                    <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                      {formatValue(c.value)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <Typography variant="caption" color="text.secondary">
                      {c.unit}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ my: 0.5 }} />

      {/* User Variables */}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...cellSx, fontWeight: 600, fontSize: '0.7rem', color: 'text.secondary', width: '30%' }}>
              Name
            </TableCell>
            <TableCell sx={{ ...cellSx, fontWeight: 600, fontSize: '0.7rem', color: 'text.secondary', width: '35%' }}>
              Expression
            </TableCell>
            <TableCell sx={{ ...cellSx, fontWeight: 600, fontSize: '0.7rem', color: 'text.secondary', width: '20%' }} align="right">
              Value
            </TableCell>
            <TableCell sx={{ ...cellSx, fontWeight: 600, fontSize: '0.7rem', color: 'text.secondary', width: '15%' }}>
              Unit
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {variables.map((v, index) => {
            const evalResult = evaluated[v.name]
            const isError = typeof evalResult === 'string'
            const displayValue = isError ? 'Error' : formatValue(evalResult as number)

            return (
              <TableRow key={index} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                {/* Name */}
                <TableCell sx={{ ...cellSx, width: '30%' }}>
                  <TextField
                    value={v.name}
                    onChange={(e) => handleUpdate(index, { name: e.target.value })}
                    variant="standard"
                    size="small"
                    fullWidth
                    sx={inputSx}
                    InputProps={{ disableUnderline: true }}
                    inputProps={{
                      style: { fontFamily: 'monospace', fontWeight: 600 },
                    }}
                  />
                </TableCell>
                {/* Expression */}
                <TableCell sx={{ ...cellSx, width: '35%' }}>
                  <TextField
                    value={v.expression}
                    onChange={(e) => handleUpdate(index, { expression: e.target.value })}
                    variant="standard"
                    size="small"
                    fullWidth
                    error={isError}
                    sx={inputSx}
                    InputProps={{ disableUnderline: true }}
                    inputProps={{ style: { fontFamily: 'monospace' } }}
                  />
                </TableCell>
                {/* Evaluated Value */}
                <TableCell sx={{ ...cellSx, width: '20%' }} align="right">
                  <Tooltip title={isError ? String(evalResult) : ''}>
                    <Typography
                      variant="caption"
                      fontFamily="monospace"
                      color={isError ? 'error' : 'text.primary'}
                      noWrap
                    >
                      {displayValue}
                    </Typography>
                  </Tooltip>
                </TableCell>
                {/* Unit + Delete */}
                <TableCell sx={{ ...cellSx, width: '15%', whiteSpace: 'nowrap' }}>
                  <TextField
                    value={v.unit || ''}
                    onChange={(e) => handleUpdate(index, { unit: e.target.value || null })}
                    variant="standard"
                    size="small"
                    placeholder=""
                    sx={{ ...inputSx, width: 30 }}
                    InputProps={{ disableUnderline: true }}
                    inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
                  />
                  <Tooltip title="Remove variable">
                    <IconButton
                      size="small"
                      onClick={() => handleRemove(index)}
                      sx={{ ml: 0.25, p: 0.25 }}
                    >
                      <DeleteIcon sx={{ fontSize: '0.9rem' }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Add button */}
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
        <Tooltip title="Add variable">
          <IconButton size="small" onClick={handleAdd} color="primary">
            <AddIcon sx={{ fontSize: '1rem' }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  )
}
