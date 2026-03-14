/**
 * FieldHeatmap — 2-D color-mapped field visualization.
 *
 * Renders Ez / Hx / Hy (or |E|) as a canvas-drawn heatmap with
 * structure outline overlay and colorbar. Falls back to a 1-D line
 * plot when the data is one-dimensional.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Stack,
  type SelectChangeEvent,
} from '@mui/material'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { extractFdtdField } from '@/store/fdtdSolverSlice'
import type { FieldComponent } from '@/types/fdtd'
import Colorbar, { valueToColor, type ColormapName } from './Colorbar'
import PlotContainer from './PlotContainer'

function FieldHeatmap() {
  const dispatch = useAppDispatch()
  const solver = useAppSelector((s) => s.fdtdSolver)
  const design = useAppSelector((s) => s.fdtdDesign)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [fieldComponent, setFieldComponent] = useState<FieldComponent>('Ez')
  const [colormap, setColormap] = useState<ColormapName>('viridis')

  // Available components based on mode
  const availableComponents: FieldComponent[] =
    solver.mode === 'tm' ? ['Ez', 'Hx', 'Hy'] : ['Hz', 'Ex', 'Ey']

  // Request field extraction when component changes
  const handleComponentChange = useCallback(
    (component: FieldComponent) => {
      setFieldComponent(component)
      if (solver.results?.fields_final[component]) {
        dispatch(
          extractFdtdField({
            fieldComponent: component,
            dx: design.cellSize[0],
            dy: design.dimensionality === '2d' ? design.cellSize[1] : undefined,
          }),
        )
      }
    },
    [dispatch, solver.results, design.cellSize, design.dimensionality],
  )

  // Draw heatmap on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const snapshot = solver.fieldSnapshot
    if (!canvas || !snapshot) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const values = snapshot.values
    const xCoords = snapshot.x_coords
    const yCoords = snapshot.y_coords
    const minV = snapshot.min_value
    const maxV = snapshot.max_value

    if (yCoords.length === 0 || !Array.isArray(values[0])) {
      // 1-D: draw as line plot on canvas
      const flat = values as number[]
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // Axes
      ctx.strokeStyle = '#666'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(40, h - 30)
      ctx.lineTo(w - 10, h - 30)
      ctx.moveTo(40, 10)
      ctx.lineTo(40, h - 30)
      ctx.stroke()

      // Data
      const plotW = w - 50
      const plotH = h - 50
      ctx.strokeStyle = '#1976d2'
      ctx.lineWidth = 2
      ctx.beginPath()
      flat.forEach((v, i) => {
        const x = 40 + (i / (flat.length - 1)) * plotW
        const y = 10 + plotH - ((v - minV) / (maxV - minV || 1)) * plotH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Labels
      ctx.fillStyle = '#333'
      ctx.font = '11px sans-serif'
      ctx.fillText('x [m]', w / 2, h - 5)
      ctx.save()
      ctx.translate(12, h / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(snapshot.field_component, 0, 0)
      ctx.restore()
      return
    }

    // 2-D heatmap
    const data2d = values as number[][]
    const nx = data2d.length
    const ny = data2d[0].length
    canvas.width = nx
    canvas.height = ny

    const imageData = ctx.createImageData(nx, ny)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const color = valueToColor(data2d[i][j], minV, maxV, colormap)
        // Parse rgb(r,g,b)
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
  }, [solver.fieldSnapshot, colormap])

  if (!solver.results) {
    return (
      <PlotContainer title="Field Heatmap">
        <Typography color="text.secondary">No simulation results available.</Typography>
      </PlotContainer>
    )
  }

  return (
    <PlotContainer title="Field Heatmap" subtitle={solver.fieldSnapshot?.field_component}>
      <Stack direction="row" spacing={1} sx={{ height: '100%' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Controls */}
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Component</InputLabel>
              <Select
                value={fieldComponent}
                label="Component"
                onChange={(e: SelectChangeEvent) =>
                  handleComponentChange(e.target.value as FieldComponent)
                }
              >
                {availableComponents.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

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

        {/* Colorbar */}
        {solver.fieldSnapshot && (
          <Colorbar
            min={solver.fieldSnapshot.min_value}
            max={solver.fieldSnapshot.max_value}
            label={solver.fieldSnapshot.field_component}
            colormap={colormap}
            onColormapChange={setColormap}
            height={260}
          />
        )}
      </Stack>
    </PlotContainer>
  )
}

export default FieldHeatmap
