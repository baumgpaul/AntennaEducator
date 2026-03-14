/**
 * ProbeTimeSeries — Time-domain probe data visualization.
 *
 * Renders each probe's field vs time as a Recharts line chart.
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  type SelectChangeEvent,
} from '@mui/material'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { useAppSelector } from '@/store/hooks'
import PlotContainer from './PlotContainer'

const COLORS = ['#1976d2', '#d32f2f', '#2e7d32', '#e65100', '#7b1fa2', '#00796b']

function ProbeTimeSeries() {
  const solver = useAppSelector((s) => s.fdtdSolver)
  const probes = solver.results?.probe_data ?? []
  const [selectedProbes, setSelectedProbes] = useState<number[]>(
    probes.length > 0 ? [0] : [],
  )

  if (!solver.results || probes.length === 0) {
    return (
      <PlotContainer title="Probe Time Series">
        <Typography color="text.secondary">
          No probe data available. Add probes and run a simulation.
        </Typography>
      </PlotContainer>
    )
  }

  // Build chart data from selected probes
  const chartData = probes[0]?.times.map((t, ti) => {
    const point: Record<string, number> = { time: t * 1e9 } // convert to ns
    for (const idx of selectedProbes) {
      const p = probes[idx]
      if (p) {
        point[p.name] = p.values[ti] ?? 0
      }
    }
    return point
  }) ?? []

  // Peak values
  const peakValues = selectedProbes.map((idx) => {
    const p = probes[idx]
    if (!p) return null
    const peak = Math.max(...p.values.map(Math.abs))
    return { name: p.name, peak }
  }).filter(Boolean)

  return (
    <PlotContainer title="Probe Time Series">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
        {/* Probe selector */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Probes</InputLabel>
            <Select
              multiple
              value={selectedProbes}
              label="Probes"
              onChange={(e: SelectChangeEvent<number[]>) => {
                const val = e.target.value
                setSelectedProbes(typeof val === 'string' ? [] : val)
              }}
              renderValue={(selected) =>
                selected.map((i) => probes[i]?.name ?? i).join(', ')
              }
            >
              {probes.map((p, i) => (
                <MenuItem key={i} value={i}>
                  {p.name} ({p.field_component})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {peakValues.map((pv) =>
            pv ? (
              <Chip
                key={pv.name}
                label={`${pv.name}: peak ${pv.peak.toExponential(2)}`}
                size="small"
              />
            ) : null,
          )}
        </Stack>

        {/* Chart */}
        <Box sx={{ flex: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                label={{ value: 'Time (ns)', position: 'insideBottomRight', offset: -5 }}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <YAxis label={{ value: 'Field Value', angle: -90, position: 'insideLeft' }} />
              <RechartsTooltip
                formatter={(v: number, name: string) => [v.toExponential(3), name]}
                labelFormatter={(l: number) => `t = ${l.toFixed(3)} ns`}
              />
              <Legend />
              {selectedProbes.map((idx, ci) => {
                const p = probes[idx]
                if (!p) return null
                return (
                  <Line
                    key={idx}
                    type="monotone"
                    dataKey={p.name}
                    stroke={COLORS[ci % COLORS.length]}
                    dot={false}
                    strokeWidth={1.5}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </PlotContainer>
  )
}

export default ProbeTimeSeries
