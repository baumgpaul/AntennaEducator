/**
 * RCSPlot — 2-D bistatic radar cross section plot.
 *
 * Polar or Cartesian display of σ₂D vs angle from the RCS backend endpoint.
 */

import { useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  Button,
  CircularProgress,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { fetchRcs } from '@/store/fdtdPostprocessingSlice'
import PlotContainer from './PlotContainer'

function RCSPlot() {
  const dispatch = useAppDispatch()
  const solver = useAppSelector((s) => s.fdtdSolver)
  const design = useAppSelector((s) => s.fdtdDesign)
  const postprocessing = useAppSelector((s) => s.fdtdPostprocessing)
  const [plotType, setPlotType] = useState<'polar' | 'cartesian'>('polar')

  const rcsResult = postprocessing.rcsResult
  const computing = postprocessing.computingRcs

  const handleCompute = async () => {
    if (!solver.results?.fields_final) return
    const fields = solver.results.fields_final
    const ez = fields['Ez']
    if (!ez) return

    // Simplified: use final field as scattered field on contour
    // Real implementation would extract scattered field on a near-field contour
    const flat = Array.isArray(ez[0]) ? (ez as number[][]).flat() : (ez as number[])
    const nAngles = Math.min(flat.length, 360)
    const scattered_e = flat.slice(0, nAngles)
    const scattered_h = flat.slice(0, nAngles).map((v) => v * 0.00265) // ~1/Z₀

    await dispatch(
      fetchRcs({
        scattered_e,
        scattered_h,
        incident_e0: 1.0,
        frequency_hz: design.config.dft_frequencies[0] || 1e9,
        contour_radius: Math.min(design.domainSize[0], design.domainSize[1] || design.domainSize[0]) * 0.4,
        num_angles: nAngles,
      }),
    )
  }

  if (!solver.results) {
    return (
      <PlotContainer title="Radar Cross Section (RCS)">
        <Typography color="text.secondary">No simulation results available.</Typography>
      </PlotContainer>
    )
  }

  if (!rcsResult) {
    return (
      <PlotContainer title="Radar Cross Section (RCS)">
        <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
          <Typography color="text.secondary">
            Compute bistatic 2-D RCS from scattered field data.
          </Typography>
          <Button
            variant="contained"
            onClick={handleCompute}
            disabled={computing || design.dimensionality !== '2d'}
          >
            {computing ? <CircularProgress size={20} /> : 'Compute RCS'}
          </Button>
          {design.dimensionality !== '2d' && (
            <Typography variant="caption" color="text.secondary">
              RCS requires a 2-D simulation.
            </Typography>
          )}
        </Stack>
      </PlotContainer>
    )
  }

  // Prepare data
  const maxRcsLin = Math.max(...rcsResult.rcs_2d, 1e-30)
  const polarData = rcsResult.angles_deg
    .filter((_, i) => i % 5 === 0)
    .map((angle, idx) => {
      const i = idx * 5
      return {
        angle: Math.round(angle),
        value: rcsResult.rcs_2d[i] / maxRcsLin,
        db: rcsResult.rcs_db[i],
      }
    })

  const cartData = rcsResult.angles_deg.map((angle, i) => ({
    angle,
    rcs_db: rcsResult.rcs_db[i],
  }))

  return (
    <PlotContainer
      title="Radar Cross Section (RCS)"
      subtitle={`Max: ${rcsResult.max_rcs.toExponential(2)} m at ${rcsResult.max_rcs_angle_deg.toFixed(0)}°`}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={`σ_max = ${rcsResult.max_rcs.toExponential(2)} m`}
            size="small"
            color="primary"
          />
          <Chip label={`θ_max = ${rcsResult.max_rcs_angle_deg.toFixed(0)}°`} size="small" />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={plotType}
            onChange={(_, v) => v && setPlotType(v)}
          >
            <ToggleButton value="polar">Polar</ToggleButton>
            <ToggleButton value="cartesian">Cartesian</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Box sx={{ flex: 1 }}>
          <ResponsiveContainer width="100%" height="100%">
            {plotType === 'polar' ? (
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={polarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="angle" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis tick={false} domain={[0, 1]} />
                <Radar
                  dataKey="value"
                  stroke="#d32f2f"
                  fill="#d32f2f"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <RechartsTooltip
                  formatter={(_v, _name, entry) => {
                    const p = (entry as { payload?: { db?: number; angle?: number } }).payload
                    return p ? [`${p.db?.toFixed(1)} dB·m at ${p.angle}°`, 'RCS'] : []
                  }}
                />
              </RadarChart>
            ) : (
              <LineChart data={cartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="angle"
                  label={{ value: 'Angle (°)', position: 'insideBottomRight', offset: -5 }}
                />
                <YAxis label={{ value: 'σ₂D (dB·m)', angle: -90, position: 'insideLeft' }} />
                <RechartsTooltip
                  formatter={(v: number) => [`${v.toFixed(1)} dB·m`, 'σ₂D']}
                  labelFormatter={(l: number) => `${l.toFixed(0)}°`}
                />
                <Line
                  type="monotone"
                  dataKey="rcs_db"
                  stroke="#d32f2f"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </Box>
      </Box>
    </PlotContainer>
  )
}

export default RCSPlot
