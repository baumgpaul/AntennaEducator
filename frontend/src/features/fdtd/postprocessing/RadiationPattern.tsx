/**
 * RadiationPattern — 2-D polar radiation pattern plot.
 *
 * Renders far-field pattern on a polar chart using Recharts.
 * Shows directivity, half-power beamwidth, main lobe annotation.
 */

import { useState } from 'react'
import { Box, Typography, Stack, Chip, Button, CircularProgress } from '@mui/material'
import {
  ResponsiveContainer,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { fetchRadiationPattern } from '@/store/fdtdPostprocessingSlice'
import PlotContainer from './PlotContainer'

function RadiationPattern() {
  const dispatch = useAppDispatch()
  const solver = useAppSelector((s) => s.fdtdSolver)
  const design = useAppSelector((s) => s.fdtdDesign)
  const postprocessing = useAppSelector((s) => s.fdtdPostprocessing)
  const [loading, setLoading] = useState(false)

  const pattern = postprocessing.radiationPattern
  const computing = postprocessing.computingRadiation

  const handleCompute = async () => {
    if (!solver.results?.fields_final) return

    const fields = solver.results.fields_final
    const ez = fields['Ez'] as number[][]
    const hx = fields['Hx'] as number[][]
    const hy = fields['Hy'] as number[][]
    if (!ez || !hx || !hy) return

    setLoading(true)
    try {
      await dispatch(
        fetchRadiationPattern({
          e_field: ez,
          h_field_x: hx,
          h_field_y: hy,
          frequency_hz: design.config.dft_frequencies[0] || 1e9,
          dx: design.cellSize[0],
          dy: design.cellSize[1],
        }),
      ).unwrap()
    } finally {
      setLoading(false)
    }
  }

  if (!solver.results) {
    return (
      <PlotContainer title="Radiation Pattern">
        <Typography color="text.secondary">No simulation results available.</Typography>
      </PlotContainer>
    )
  }

  if (!pattern) {
    return (
      <PlotContainer title="Radiation Pattern">
        <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
          <Typography color="text.secondary">
            Compute the far-field pattern from near-field data.
          </Typography>
          <Button
            variant="contained"
            onClick={handleCompute}
            disabled={computing || design.dimensionality !== '2d'}
          >
            {computing ? <CircularProgress size={20} /> : 'Compute Radiation Pattern'}
          </Button>
          {design.dimensionality !== '2d' && (
            <Typography variant="caption" color="text.secondary">
              Radiation pattern requires a 2-D simulation.
            </Typography>
          )}
        </Stack>
      </PlotContainer>
    )
  }

  // Prepare polar data: normalize linear pattern to [0, 1] for radar chart
  const maxLin = Math.max(...pattern.pattern_linear, 1e-30)
  const data = pattern.angles_deg.map((angle, i) => ({
    angle: Math.round(angle),
    value: pattern.pattern_linear[i] / maxLin,
    db: pattern.pattern_db[i],
  }))

  // Downsample for rendering (every 5 degrees)
  const sampled = data.filter((_, i) => i % 5 === 0)

  return (
    <PlotContainer
      title="Radiation Pattern"
      subtitle={`Directivity: ${pattern.max_directivity_db.toFixed(1)} dBi`}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
        {/* Annotations */}
        <Stack direction="row" spacing={1}>
          <Chip label={`D = ${pattern.max_directivity_db.toFixed(1)} dBi`} size="small" color="primary" />
          {pattern.beam_width_deg != null && (
            <Chip label={`HPBW = ${pattern.beam_width_deg.toFixed(1)}°`} size="small" />
          )}
        </Stack>

        {/* Polar chart */}
        <Box sx={{ flex: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={sampled}>
              <PolarGrid />
              <PolarAngleAxis dataKey="angle" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis tick={false} domain={[0, 1]} />
              <Radar
                dataKey="value"
                stroke="#1976d2"
                fill="#1976d2"
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <RechartsTooltip
                formatter={(_v, _name, entry) => {
                  const p = (entry as { payload?: { db?: number; angle?: number } }).payload
                  return p ? [`${p.db?.toFixed(1)} dB at ${p.angle}°`, 'Pattern'] : []
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </PlotContainer>
  )
}

export default RadiationPattern
