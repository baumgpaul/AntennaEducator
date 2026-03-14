/**
 * FrequencyFieldMap — DFT field magnitude and phase at a selected frequency.
 *
 * Shows magnitude heatmap + phase heatmap from on-the-fly DFT data.
 */

import { useState, useRef, useEffect } from 'react'
import {
  Box,
  Typography,
  Stack,
  Button,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButtonGroup,
  ToggleButton,
  type SelectChangeEvent,
} from '@mui/material'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { fetchFrequencyField } from '@/store/fdtdPostprocessingSlice'
import Colorbar, { valueToColor, type ColormapName } from './Colorbar'
import PlotContainer from './PlotContainer'

function FrequencyFieldMap() {
  const dispatch = useAppDispatch()
  const solver = useAppSelector((s) => s.fdtdSolver)
  const design = useAppSelector((s) => s.fdtdDesign)
  const postprocessing = useAppSelector((s) => s.fdtdPostprocessing)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [selectedFreq, setSelectedFreq] = useState<number | null>(null)
  const [displayMode, setDisplayMode] = useState<'magnitude' | 'phase'>('magnitude')
  const [colormap, setColormap] = useState<ColormapName>('viridis')

  const freqField = postprocessing.frequencyField
  const computing = postprocessing.computingFreqField

  // Available DFT frequencies from solver results
  const dftFreqs = Object.keys(solver.results?.dft_results ?? {})
    .filter((k) => k.match(/^\d/))
    .map(Number)
    .sort((a, b) => a - b)

  // Also use config frequencies
  const configFreqs = design.config.dft_frequencies ?? []
  const allFreqs = [...new Set([...dftFreqs, ...configFreqs])].sort((a, b) => a - b)

  const handleCompute = async () => {
    if (!solver.results?.dft_results || selectedFreq == null) return

    // Get DFT data for the selected frequency
    const dftData = solver.results.dft_results[selectedFreq.toString()] as {
      real: number[] | number[][]
      imag: number[] | number[][]
    } | undefined

    if (!dftData) return

    await dispatch(
      fetchFrequencyField({
        frequency_hz: selectedFreq,
        dft_real: dftData.real,
        dft_imag: dftData.imag,
        dx: design.cellSize[0],
        dy: design.dimensionality === '2d' ? design.cellSize[1] : undefined,
      }),
    )
  }

  // Draw field map
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !freqField) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = displayMode === 'magnitude' ? freqField.magnitude : freqField.phase_deg
    if (!Array.isArray(data[0])) return // 1-D not supported for heatmap

    const data2d = data as number[][]
    const nx = data2d.length
    const ny = data2d[0].length
    canvas.width = nx
    canvas.height = ny

    let min = Infinity, max = -Infinity
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        if (data2d[i][j] < min) min = data2d[i][j]
        if (data2d[i][j] > max) max = data2d[i][j]
      }
    }

    const cm: ColormapName = displayMode === 'phase' ? 'RdBu' : colormap

    const imageData = ctx.createImageData(nx, ny)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const color = valueToColor(data2d[i][j], min, max, cm)
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
  }, [freqField, displayMode, colormap])

  if (!solver.results) {
    return (
      <PlotContainer title="Frequency-Domain Field">
        <Typography color="text.secondary">No simulation results available.</Typography>
      </PlotContainer>
    )
  }

  if (allFreqs.length === 0) {
    return (
      <PlotContainer title="Frequency-Domain Field">
        <Typography color="text.secondary">
          No DFT frequencies configured. Add DFT frequencies in the solver configuration and re-run.
        </Typography>
      </PlotContainer>
    )
  }

  return (
    <PlotContainer
      title="Frequency-Domain Field"
      subtitle={freqField ? `${(freqField.frequency_hz / 1e9).toFixed(3)} GHz` : undefined}
    >
      <Stack direction="row" spacing={1} sx={{ height: '100%' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Controls */}
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Frequency</InputLabel>
              <Select
                value={selectedFreq?.toString() ?? ''}
                label="Frequency"
                onChange={(e: SelectChangeEvent) => setSelectedFreq(Number(e.target.value))}
              >
                {allFreqs.map((f) => (
                  <MenuItem key={f} value={f.toString()}>
                    {(f / 1e9).toFixed(3)} GHz
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              size="small"
              onClick={handleCompute}
              disabled={computing || selectedFreq == null}
            >
              {computing ? <CircularProgress size={16} /> : 'Extract'}
            </Button>
            {freqField && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={displayMode}
                onChange={(_, v) => v && setDisplayMode(v)}
              >
                <ToggleButton value="magnitude">|E|</ToggleButton>
                <ToggleButton value="phase">Phase</ToggleButton>
              </ToggleButtonGroup>
            )}
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
            {freqField ? (
              <canvas
                ref={canvasRef}
                width={400}
                height={300}
                style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
              />
            ) : (
              <Typography color="text.secondary">Select a frequency and click Extract.</Typography>
            )}
          </Box>
        </Box>

        {freqField && (
          <Colorbar
            min={
              displayMode === 'magnitude'
                ? 0
                : -180
            }
            max={
              displayMode === 'magnitude'
                ? Math.max(
                    ...(Array.isArray(freqField.magnitude[0])
                      ? (freqField.magnitude as number[][]).flat()
                      : (freqField.magnitude as number[])),
                    1e-30,
                  )
                : 180
            }
            label={displayMode === 'magnitude' ? '|E| (V/m)' : 'Phase (°)'}
            colormap={displayMode === 'phase' ? 'RdBu' : colormap}
            onColormapChange={displayMode === 'magnitude' ? setColormap : undefined}
            height={240}
          />
        )}
      </Stack>
    </PlotContainer>
  )
}

export default FrequencyFieldMap
