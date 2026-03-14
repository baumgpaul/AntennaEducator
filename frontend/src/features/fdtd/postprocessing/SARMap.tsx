/**
 * SARMap — Specific Absorption Rate heatmap overlaid on tissue geometry.
 *
 * Renders SAR = σ|E|²/(2ρ) as a color-mapped image with peak/average
 * SAR values and safety threshold annotations.
 */

import { useState, useRef, useEffect } from 'react'
import { Box, Typography, Stack, Button, CircularProgress, Chip, Alert } from '@mui/material'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { fetchSar } from '@/store/fdtdPostprocessingSlice'
import Colorbar, { valueToColor, type ColormapName } from './Colorbar'
import PlotContainer from './PlotContainer'

// SAR safety limits (ICNIRP/IEEE)
const SAR_1G_LIMIT = 1.6 // W/kg (US FCC)
const SAR_10G_LIMIT = 2.0 // W/kg (ICNIRP)

function SARMap() {
  const dispatch = useAppDispatch()
  const solver = useAppSelector((s) => s.fdtdSolver)
  const design = useAppSelector((s) => s.fdtdDesign)
  const postprocessing = useAppSelector((s) => s.fdtdPostprocessing)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [colormap, setColormap] = useState<ColormapName>('hot')

  const sarResult = postprocessing.sarResult
  const computing = postprocessing.computingSar

  const handleCompute = async () => {
    if (!solver.results?.fields_final) return

    // Get E-field magnitude
    const fields = solver.results.fields_final
    const ez = fields['Ez']
    if (!ez) return

    // Build conductivity and density maps from structures
    // For now, use uniform values (proper implementation would map from structures)
    const shape = Array.isArray(ez[0]) ? [ez.length, (ez[0] as number[]).length] : [ez.length]
    const sigma = Array.isArray(ez[0])
      ? (ez as number[][]).map((row) => row.map(() => 0.0))
      : (ez as number[]).map(() => 0.0)
    const density = Array.isArray(ez[0])
      ? (ez as number[][]).map((row) => row.map(() => 1000.0))
      : (ez as number[]).map(() => 1000.0)

    // Apply structure materials
    for (const s of design.structures) {
      if (s.custom_material?.sigma && s.custom_material.sigma > 0) {
        // Mark cells inside this structure with its conductivity
        // Simplified: would need proper spatial mapping
      }
    }

    // Compute E-field magnitude
    const eMag = Array.isArray(ez[0])
      ? (ez as number[][]).map((row) => row.map(Math.abs))
      : (ez as number[]).map(Math.abs)

    await dispatch(
      fetchSar({
        e_field_magnitude: eMag,
        sigma,
        density,
        dx: design.cellSize[0],
        dy: design.dimensionality === '2d' ? design.cellSize[1] : undefined,
      }),
    )
  }

  // Draw SAR heatmap
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sarResult) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sar = sarResult.sar
    if (!Array.isArray(sar[0])) return // 1-D not supported for heatmap

    const data = sar as number[][]
    const nx = data.length
    const ny = data[0].length
    canvas.width = nx
    canvas.height = ny

    const imageData = ctx.createImageData(nx, ny)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const color = valueToColor(data[i][j], 0, sarResult.peak_sar, colormap)
        const m = color.match(/(\d+)/g)
        if (m) {
          const px = (j * nx + i) * 4
          imageData.data[px] = +m[0]
          imageData.data[px + 1] = +m[1]
          imageData.data[px + 2] = +m[2]
          imageData.data[px + 3] = 255
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }, [sarResult, colormap])

  if (!solver.results) {
    return (
      <PlotContainer title="SAR Distribution">
        <Typography color="text.secondary">No simulation results available.</Typography>
      </PlotContainer>
    )
  }

  if (!sarResult) {
    return (
      <PlotContainer title="SAR Distribution">
        <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
          <Typography color="text.secondary">
            Compute SAR = σ|E|²/(2ρ) from simulation fields.
          </Typography>
          <Button
            variant="contained"
            onClick={handleCompute}
            disabled={computing}
          >
            {computing ? <CircularProgress size={20} /> : 'Compute SAR'}
          </Button>
        </Stack>
      </PlotContainer>
    )
  }

  return (
    <PlotContainer
      title="SAR Distribution"
      subtitle={`Peak: ${sarResult.peak_sar.toExponential(3)} W/kg`}
    >
      <Stack direction="row" spacing={1} sx={{ height: '100%' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Annotations */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label={`Peak SAR: ${sarResult.peak_sar.toExponential(2)} W/kg`} size="small" color="error" />
            <Chip label={`Avg SAR: ${sarResult.average_sar.toExponential(2)} W/kg`} size="small" />
          </Stack>
          {sarResult.peak_sar > SAR_1G_LIMIT && (
            <Alert severity="warning" sx={{ py: 0 }}>
              Peak SAR exceeds FCC 1g limit ({SAR_1G_LIMIT} W/kg)
            </Alert>
          )}

          {/* Canvas */}
          <Box
            sx={{
              flex: 1,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#1a1a2e',
            }}
          >
            <canvas
              ref={canvasRef}
              width={400}
              height={300}
              style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
            />
          </Box>
        </Box>

        <Colorbar
          min={0}
          max={sarResult.peak_sar}
          label="SAR (W/kg)"
          colormap={colormap}
          onColormapChange={setColormap}
          height={240}
        />
      </Stack>
    </PlotContainer>
  )
}

export default SARMap
