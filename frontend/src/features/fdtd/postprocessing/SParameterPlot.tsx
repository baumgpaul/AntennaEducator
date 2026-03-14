/**
 * SParameterPlot — S₁₁ return loss vs frequency.
 *
 * Computes S₁₁ from incident/reflected probe time-domain data via DFT.
 * Displays |S₁₁| (dB) and phase on a Recharts line chart.
 */

import { useState, useMemo } from 'react'
import {
  Box,
  Typography,
  Stack,
  Button,
  TextField,
  CircularProgress,
  Chip,
  FormControlLabel,
  Switch,
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
  ReferenceLine,
} from 'recharts'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { fetchSParams } from '@/store/fdtdPostprocessingSlice'
import PlotContainer from './PlotContainer'

function SParameterPlot() {
  const dispatch = useAppDispatch()
  const solver = useAppSelector((s) => s.fdtdSolver)
  const postprocessing = useAppSelector((s) => s.fdtdPostprocessing)

  const [freqStart, setFreqStart] = useState('0.1')
  const [freqStop, setFreqStop] = useState('3')
  const [numPoints, setNumPoints] = useState('201')
  const [incidentProbe, setIncidentProbe] = useState(0)
  const [reflectedProbe, setReflectedProbe] = useState(1)
  const [showPhase, setShowPhase] = useState(false)

  const result = postprocessing.sParams
  const computing = postprocessing.computingSParams

  const probes = solver.results?.probe_data ?? []

  const handleCompute = async () => {
    if (probes.length < 2) return
    const inc = probes[incidentProbe]
    const ref = probes[reflectedProbe]
    if (!inc || !ref) return

    // Generate frequency list [GHz → Hz]
    const fStart = parseFloat(freqStart) * 1e9
    const fStop = parseFloat(freqStop) * 1e9
    const nPts = parseInt(numPoints) || 201
    const frequencies: number[] = []
    for (let i = 0; i < nPts; i++) {
      frequencies.push(fStart + (i / (nPts - 1)) * (fStop - fStart))
    }

    await dispatch(
      fetchSParams({
        incident_values: inc.values,
        reflected_values: ref.values,
        times: inc.times,
        frequencies,
      }),
    )
  }

  // Find resonance: frequency where |S₁₁| is minimum
  const resonance = useMemo(() => {
    if (!result) return null
    let minDb = 0
    let minIdx = 0
    result.s11_mag_db.forEach((v, i) => {
      if (v < minDb) {
        minDb = v
        minIdx = i
      }
    })
    return { freq: result.frequencies[minIdx], db: minDb }
  }, [result])

  // Chart data
  const chartData = useMemo(() => {
    if (!result) return []
    return result.frequencies.map((f, i) => ({
      freq: f / 1e9,
      magnitude: result.s11_mag_db[i],
      phase: result.s11_phase_deg[i],
    }))
  }, [result])

  if (!solver.results) {
    return (
      <PlotContainer title="S-Parameters (S₁₁)">
        <Typography color="text.secondary">No simulation results available.</Typography>
      </PlotContainer>
    )
  }

  if (probes.length < 2 && !result) {
    return (
      <PlotContainer title="S-Parameters (S₁₁)">
        <Typography color="text.secondary">
          At least 2 probes are needed (incident + reflected) to compute S₁₁.
        </Typography>
      </PlotContainer>
    )
  }

  return (
    <PlotContainer
      title="S-Parameters (S₁₁)"
      subtitle={resonance ? `Resonance: ${(resonance.freq / 1e9).toFixed(3)} GHz` : undefined}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
        {/* Controls */}
        {!result && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <TextField
              label="f start (GHz)"
              size="small"
              type="number"
              value={freqStart}
              onChange={(e) => setFreqStart(e.target.value)}
              sx={{ width: 110 }}
            />
            <TextField
              label="f stop (GHz)"
              size="small"
              type="number"
              value={freqStop}
              onChange={(e) => setFreqStop(e.target.value)}
              sx={{ width: 110 }}
            />
            <TextField
              label="Points"
              size="small"
              type="number"
              value={numPoints}
              onChange={(e) => setNumPoints(e.target.value)}
              sx={{ width: 80 }}
            />
            <Button variant="contained" size="small" onClick={handleCompute} disabled={computing}>
              {computing ? <CircularProgress size={16} /> : 'Compute'}
            </Button>
          </Stack>
        )}

        {/* Annotations */}
        {resonance && (
          <Stack direction="row" spacing={1}>
            <Chip
              label={`f₀ = ${(resonance.freq / 1e9).toFixed(3)} GHz`}
              size="small"
              color="primary"
            />
            <Chip label={`S₁₁ = ${resonance.db.toFixed(1)} dB`} size="small" />
            <FormControlLabel
              control={<Switch size="small" checked={showPhase} onChange={(_, v) => setShowPhase(v)} />}
              label="Phase"
            />
          </Stack>
        )}

        {/* Chart */}
        {chartData.length > 0 && (
          <Box sx={{ flex: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="freq"
                  label={{ value: 'Frequency (GHz)', position: 'insideBottomRight', offset: -5 }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                />
                <YAxis
                  yAxisId="mag"
                  label={{ value: '|S₁₁| (dB)', angle: -90, position: 'insideLeft' }}
                />
                {showPhase && (
                  <YAxis
                    yAxisId="phase"
                    orientation="right"
                    label={{ value: 'Phase (°)', angle: 90, position: 'insideRight' }}
                  />
                )}
                <RechartsTooltip
                  formatter={(v: number, name: string) => [
                    name === 'magnitude' ? `${v.toFixed(2)} dB` : `${v.toFixed(1)}°`,
                    name === 'magnitude' ? '|S₁₁|' : 'Phase',
                  ]}
                  labelFormatter={(l: number) => `${l.toFixed(3)} GHz`}
                />
                <Legend />
                <ReferenceLine yAxisId="mag" y={-10} stroke="#888" strokeDasharray="5 5" label="-10 dB" />
                <Line
                  yAxisId="mag"
                  type="monotone"
                  dataKey="magnitude"
                  stroke="#1976d2"
                  dot={false}
                  strokeWidth={2}
                  name="|S₁₁| (dB)"
                />
                {showPhase && (
                  <Line
                    yAxisId="phase"
                    type="monotone"
                    dataKey="phase"
                    stroke="#e65100"
                    dot={false}
                    strokeWidth={1}
                    name="Phase (°)"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Box>
    </PlotContainer>
  )
}

export default SParameterPlot
