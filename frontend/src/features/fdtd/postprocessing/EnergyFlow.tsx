/**
 * EnergyFlow — Poynting vector visualization.
 *
 * Shows energy flow as an arrow (quiver) overlay on |S| magnitude heatmap.
 * Uses the POST /api/fdtd/energy backend endpoint.
 */

import { useRef, useEffect, useState } from 'react'
import { Box, Typography, Stack, Chip, Slider } from '@mui/material'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { computeFdtdPoynting } from '@/store/fdtdSolverSlice'
import { valueToColor, type ColormapName } from './Colorbar'
import Colorbar from './Colorbar'
import PlotContainer from './PlotContainer'

function EnergyFlow() {
  const dispatch = useAppDispatch()
  const solver = useAppSelector((s) => s.fdtdSolver)
  const design = useAppSelector((s) => s.fdtdDesign)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [colormap, setColormap] = useState<ColormapName>('hot')
  const [arrowDensity, setArrowDensity] = useState(4)

  // Auto-compute Poynting if results available but poynting not yet computed
  useEffect(() => {
    if (solver.results && !solver.poynting) {
      dispatch(
        computeFdtdPoynting({
          dx: design.cellSize[0],
          dy: design.dimensionality === '2d' ? design.cellSize[1] : undefined,
        }),
      )
    }
  }, [solver.results, solver.poynting, dispatch, design.cellSize, design.dimensionality])

  // Draw heatmap + arrows
  useEffect(() => {
    const canvas = canvasRef.current
    const poynting = solver.poynting
    if (!canvas || !poynting) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mag = poynting.magnitude
    if (!Array.isArray(mag) || mag.length === 0) return

    // 1-D case: line plot
    if (!Array.isArray(mag[0])) {
      const flat = mag as number[]
      const w = 500
      const h = 300
      canvas.width = w
      canvas.height = h
      ctx.clearRect(0, 0, w, h)

      const maxM = Math.max(...flat, 1e-30)
      ctx.strokeStyle = '#e65100'
      ctx.lineWidth = 2
      ctx.beginPath()
      flat.forEach((v, i) => {
        const x = 40 + (i / (flat.length - 1)) * (w - 60)
        const y = 10 + (h - 50) * (1 - v / maxM)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      ctx.fillStyle = '#333'
      ctx.font = '11px sans-serif'
      ctx.fillText('x [m]', w / 2, h - 5)
      ctx.fillText('|S| [W/m²]', 5, 12)
      return
    }

    // 2-D case: heatmap + quiver
    const data2d = mag as number[][]
    const nx = data2d.length
    const ny = data2d[0].length
    const scale = 3 // pixel scale
    canvas.width = nx * scale
    canvas.height = ny * scale

    let maxMag = 0
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        if (data2d[i][j] > maxMag) maxMag = data2d[i][j]
      }
    }

    // Draw magnitude heatmap
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        ctx.fillStyle = valueToColor(data2d[i][j], 0, maxMag, colormap)
        ctx.fillRect(i * scale, j * scale, scale, scale)
      }
    }

    // Draw arrow overlay
    const sx = poynting.sx as number[][]
    const sy = poynting.sy as number[][]
    if (sx && sy) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1.5

      const step = arrowDensity
      const arrowLen = step * scale * 0.7

      for (let i = step; i < nx - step; i += step) {
        for (let j = step; j < ny - step; j += step) {
          const vx = sx[i][j]
          const vy = sy[i][j]
          const vmag = Math.sqrt(vx * vx + vy * vy)
          if (vmag < maxMag * 0.01) continue

          const cx = i * scale + scale / 2
          const cy = j * scale + scale / 2
          const dx = (vx / vmag) * arrowLen
          const dy = (vy / vmag) * arrowLen

          ctx.beginPath()
          ctx.moveTo(cx - dx / 2, cy - dy / 2)
          ctx.lineTo(cx + dx / 2, cy + dy / 2)
          ctx.stroke()

          // Arrowhead
          const angle = Math.atan2(dy, dx)
          const headLen = 4
          ctx.beginPath()
          ctx.moveTo(cx + dx / 2, cy + dy / 2)
          ctx.lineTo(
            cx + dx / 2 - headLen * Math.cos(angle - 0.4),
            cy + dy / 2 - headLen * Math.sin(angle - 0.4),
          )
          ctx.lineTo(
            cx + dx / 2 - headLen * Math.cos(angle + 0.4),
            cy + dy / 2 - headLen * Math.sin(angle + 0.4),
          )
          ctx.closePath()
          ctx.fill()
        }
      }
    }
  }, [solver.poynting, colormap, arrowDensity])

  if (!solver.results) {
    return (
      <PlotContainer title="Energy Flow (Poynting Vector)">
        <Typography color="text.secondary">No simulation results available.</Typography>
      </PlotContainer>
    )
  }

  if (!solver.poynting) {
    return (
      <PlotContainer title="Energy Flow (Poynting Vector)" loading>
        <Typography color="text.secondary">Computing Poynting vector...</Typography>
      </PlotContainer>
    )
  }

  return (
    <PlotContainer
      title="Energy Flow (Poynting Vector)"
      subtitle={`Total Power: ${solver.poynting.total_power.toExponential(3)} W`}
    >
      <Stack direction="row" spacing={1} sx={{ height: '100%' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={`P_total = ${solver.poynting.total_power.toExponential(2)} W`}
              size="small"
              color="primary"
            />
            <Typography variant="caption" sx={{ ml: 1 }}>
              Arrow spacing:
            </Typography>
            <Slider
              size="small"
              min={2}
              max={10}
              value={arrowDensity}
              onChange={(_, v) => setArrowDensity(v as number)}
              sx={{ width: 80 }}
            />
          </Stack>

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
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          </Box>
        </Box>

        <Colorbar
          min={0}
          max={Math.max(
            ...((Array.isArray(solver.poynting.magnitude[0])
              ? (solver.poynting.magnitude as number[][]).flat()
              : solver.poynting.magnitude) as number[]),
            1e-30,
          )}
          label="|S| (W/m²)"
          colormap={colormap}
          onColormapChange={setColormap}
          height={240}
        />
      </Stack>
    </PlotContainer>
  )
}

export default EnergyFlow
