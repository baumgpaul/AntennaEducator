/**
 * TimeAnimation — Playback of field evolution over time.
 *
 * Uses PlaneProbe snapshot data to animate the field as a heatmap.
 * Transport controls: play/pause, step, speed, frame scrubber.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Slider,
  IconButton,
  Stack,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import {
  PlayArrow,
  Pause,
  SkipNext,
  SkipPrevious,
  Replay,
} from '@mui/icons-material'
import { useAppSelector } from '@/store/hooks'
import type { ProbeResult } from '@/types/fdtd'
import { valueToColor, type ColormapName } from './Colorbar'
import PlotContainer from './PlotContainer'

function TimeAnimation() {
  const solver = useAppSelector((s) => s.fdtdSolver)
  const [playing, setPlaying] = useState(false)
  const [frame, setFrame] = useState(0)
  const [speed, setSpeed] = useState<string>('1')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<number | null>(null)

  // Find plane probes with snapshot data
  const planeProbes: ProbeResult[] =
    solver.results?.probe_data.filter((p) => p.snapshots && p.snapshots.length > 0) ?? []

  const activeProbe = planeProbes[0]
  const snapshots = (activeProbe?.snapshots ?? []) as number[][][]
  const totalFrames = snapshots.length

  // Animation loop
  useEffect(() => {
    if (playing && totalFrames > 1) {
      const interval = 100 / parseFloat(speed)
      timerRef.current = window.setInterval(() => {
        setFrame((f) => (f + 1 >= totalFrames ? 0 : f + 1))
      }, interval)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [playing, speed, totalFrames])

  // Draw current frame
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !snapshots.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = snapshots[frame]
    if (!data || !Array.isArray(data)) return

    // Treat as 2D array
    const rows = data as number[][]
    if (!rows.length || !Array.isArray(rows[0])) return

    const nx = rows.length
    const ny = rows[0].length
    canvas.width = nx
    canvas.height = ny

    // Find global min/max across all frames (approximate from current frame)
    let min = Infinity, max = -Infinity
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const v = rows[i][j]
        if (v < min) min = v
        if (v > max) max = v
      }
    }

    const imageData = ctx.createImageData(nx, ny)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const color = valueToColor(rows[i][j], min, max, 'coolwarm')
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
  }, [frame, snapshots])

  if (!solver.results) {
    return (
      <PlotContainer title="Time Animation">
        <Typography color="text.secondary">No simulation results available.</Typography>
      </PlotContainer>
    )
  }

  if (totalFrames === 0) {
    return (
      <PlotContainer title="Time Animation">
        <Typography color="text.secondary">
          No plane probe snapshots found. Add a plane probe and re-run the simulation.
        </Typography>
      </PlotContainer>
    )
  }

  return (
    <PlotContainer title="Time Animation" subtitle={`Frame ${frame + 1} / ${totalFrames}`}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
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

        {/* Transport controls */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Previous frame">
            <IconButton
              size="small"
              onClick={() => setFrame((f) => Math.max(0, f - 1))}
              disabled={playing}
            >
              <SkipPrevious />
            </IconButton>
          </Tooltip>
          <Tooltip title={playing ? 'Pause' : 'Play'}>
            <IconButton size="small" onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause /> : <PlayArrow />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Next frame">
            <IconButton
              size="small"
              onClick={() => setFrame((f) => Math.min(totalFrames - 1, f + 1))}
              disabled={playing}
            >
              <SkipNext />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset">
            <IconButton
              size="small"
              onClick={() => {
                setPlaying(false)
                setFrame(0)
              }}
            >
              <Replay />
            </IconButton>
          </Tooltip>

          {/* Speed */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={speed}
            onChange={(_, v) => v && setSpeed(v)}
          >
            <ToggleButton value="0.5">0.5x</ToggleButton>
            <ToggleButton value="1">1x</ToggleButton>
            <ToggleButton value="2">2x</ToggleButton>
            <ToggleButton value="4">4x</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {/* Frame scrubber */}
        <Slider
          size="small"
          min={0}
          max={totalFrames - 1}
          value={frame}
          onChange={(_, v) => {
            setPlaying(false)
            setFrame(v as number)
          }}
        />
      </Box>
    </PlotContainer>
  )
}

export default TimeAnimation
