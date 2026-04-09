/**
 * FEMLinePlot — Line chart showing field values along a line.
 *
 * Uses Recharts LineChart with arc-length on X-axis and field value on Y-axis.
 */

import { Box, Typography } from '@mui/material'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useAppSelector } from '@/store/hooks'
import type { LinePlotData } from '@/types/femResults'

interface FEMLinePlotProps {
  plotId: string
  fieldName: string
}

function FEMLinePlot({ plotId, fieldName }: FEMLinePlotProps) {
  const plotData = useAppSelector((s) => s.femSolver.linePlotData[plotId]) as LinePlotData | undefined

  if (!plotData) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No data available for this line plot.
        </Typography>
      </Box>
    )
  }

  const chartData = plotData.distances.map((d, i) => ({
    distance: d,
    value: plotData.values[i],
  }))

  return (
    <Box sx={{ width: '100%', height: 250 }}>
      <Typography variant="caption" fontWeight={500} sx={{ px: 1 }}>
        {fieldName} along line
      </Typography>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="distance"
            type="number"
            tickFormatter={(v: number) => v.toFixed(3)}
            label={{ value: 'Arc length', position: 'insideBottom', offset: -10 }}
          />
          <YAxis
            tickFormatter={(v: number) => v.toExponential(2)}
            label={{ value: fieldName, angle: -90, position: 'insideLeft', offset: 10 }}
          />
          <Tooltip
            formatter={(value: number) => [value.toExponential(4), fieldName]}
            labelFormatter={(label: number) => `s = ${label.toFixed(4)}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#1976d2"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  )
}

export default FEMLinePlot
