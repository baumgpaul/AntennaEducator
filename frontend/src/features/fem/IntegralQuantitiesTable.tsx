/**
 * IntegralQuantitiesTable — Table display of computed integral quantities.
 *
 * Shows energy, charge, capacitance, etc. from solver results.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
} from '@mui/material'
import { useAppSelector } from '@/store/hooks'
import { selectFEMSolveResult } from '@/store/femSolverSlice'

const INTEGRAL_LABELS: Record<string, string> = {
  electric_energy: 'Electric Energy',
  total_power: 'Total Power Dissipation',
}

function integralDisplayName(name: string): string {
  return INTEGRAL_LABELS[name] ?? name
}

function IntegralQuantitiesTable() {
  const result = useAppSelector(selectFEMSolveResult)

  if (!result || result.integralQuantities.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No integral quantities computed.
        </Typography>
      </Box>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell><Typography variant="caption" fontWeight={600}>Quantity</Typography></TableCell>
            <TableCell align="right"><Typography variant="caption" fontWeight={600}>Value</Typography></TableCell>
            <TableCell><Typography variant="caption" fontWeight={600}>Unit</Typography></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {result.integralQuantities.map((q) => (
            <TableRow key={q.name}>
              <TableCell>
                <Typography variant="body2">{integralDisplayName(q.name)}</Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontFamily="monospace">
                  {q.value.toExponential(4)}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">{q.unit}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default IntegralQuantitiesTable
