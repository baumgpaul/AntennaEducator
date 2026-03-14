/**
 * FdtdSolverTab — Extracted and enhanced solver tab.
 *
 * Sections:
 *  1. Pre-solve checks (CFL stability, grid quality, memory, est. time)
 *  2. Solver configuration (time steps, Courant, mode, DFT frequencies)
 *  3. DFT configuration dialog
 *  4. Run button with progress bar + status
 *  5. Results summary
 */

import { useState, useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Divider,
  Chip,
  LinearProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Switch,
  FormControlLabel,
} from '@mui/material'
import {
  PlayArrow as RunIcon,
  CheckCircle as OkIcon,
  Warning as WarnIcon,
  Error as ErrIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import CircularProgress from '@mui/material/CircularProgress'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setConfig } from '@/store/fdtdDesignSlice'
import { setMode } from '@/store/fdtdSolverSlice'
import type { FdtdDimensionality } from '@/types/fdtd'

// ============================================================================
// Physics helpers
// ============================================================================

const C_0 = 299_792_458 // m/s

/** CFL stability limit: dt_max for given cell size and dimensionality. */
function cflDtMax(dx: number, dy: number, dim: FdtdDimensionality): number {
  if (dim === '1d') return dx / C_0
  return 1 / (C_0 * Math.sqrt(1 / (dx * dx) + 1 / (dy * dy)))
}

/** Actual dt = courant * dt_max */
function actualDt(courant: number, dx: number, dy: number, dim: FdtdDimensionality): number {
  return courant * cflDtMax(dx, dy, dim)
}

/** Cells per wavelength at given frequency. */
function cellsPerWavelength(freq: number, cellSize: number): number {
  if (freq <= 0) return Infinity
  const lambda = C_0 / freq
  return lambda / cellSize
}

/** Memory estimate in bytes: nx * ny * 8 bytes * numFields. */
function memoryEstimate(
  domainSize: [number, number, number],
  cellSize: [number, number, number],
  dim: FdtdDimensionality,
): number {
  const nx = Math.ceil(domainSize[0] / cellSize[0])
  if (dim === '1d') return nx * 8 * 3 // Ez, Hy (+ aux)
  const ny = Math.ceil(domainSize[1] / cellSize[1])
  return nx * ny * 8 * 6 // Ez, Hx, Hy + Ce, update coeffs, aux
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Rough solve time heuristic: (nx * ny * steps * 5ns) */
function estimateSolveTime(
  domainSize: [number, number, number],
  cellSize: [number, number, number],
  dim: FdtdDimensionality,
  steps: number,
): number {
  const nx = Math.ceil(domainSize[0] / cellSize[0])
  const ny = dim === '2d' ? Math.ceil(domainSize[1] / cellSize[1]) : 1
  return nx * ny * steps * 5e-9 // ~5ns per cell-step
}

function formatTime(seconds: number): string {
  if (seconds < 0.1) return '< 0.1 s'
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return `${(seconds / 60).toFixed(1)} min`
}

// ============================================================================
// Pre-Solve Check Status
// ============================================================================

type CheckLevel = 'ok' | 'warn' | 'error'

interface PreSolveCheck {
  label: string
  value: string
  level: CheckLevel
  detail: string
}

// ============================================================================
// Component
// ============================================================================

interface FdtdSolverTabProps {
  onRunSimulation: () => void
}

function FdtdSolverTab({ onRunSimulation }: FdtdSolverTabProps) {
  const dispatch = useAppDispatch()
  const design = useAppSelector((s) => s.fdtdDesign)
  const solver = useAppSelector((s) => s.fdtdSolver)

  const [dftDialogOpen, setDftDialogOpen] = useState(false)
  const [dftStart, setDftStart] = useState(1)
  const [dftStop, setDftStop] = useState(10)
  const [dftPoints, setDftPoints] = useState(5)
  const [dftLogScale, setDftLogScale] = useState(false)
  const [manualFreq, setManualFreq] = useState('')

  // ---------- Pre-solve checks ----------
  const checks = useMemo<PreSolveCheck[]>(() => {
    const dx = design.cellSize[0]
    const dy = design.cellSize[1]
    const dim = design.dimensionality
    const courant = design.config.courant_number
    const dtMax = cflDtMax(dx, dy, dim)
    const dt = actualDt(courant, dx, dy, dim)
    const steps = design.config.num_time_steps

    const result: PreSolveCheck[] = []

    // 1. CFL stability
    const cflRatio = courant
    let cflLevel: CheckLevel = 'ok'
    if (cflRatio > 1.0) cflLevel = 'error'
    else if (cflRatio > 0.95) cflLevel = 'warn'
    result.push({
      label: 'CFL Stability',
      value: `C = ${cflRatio.toFixed(3)} (dt = ${dt.toExponential(2)} s)`,
      level: cflLevel,
      detail:
        cflLevel === 'error'
          ? `Courant number > 1 → UNSTABLE. Max dt = ${dtMax.toExponential(2)} s.`
          : cflLevel === 'warn'
            ? 'Very close to stability limit. Consider reducing Courant number.'
            : `Stable. dt_max = ${dtMax.toExponential(2)} s.`,
    })

    // 2. Grid quality (cells per wavelength)
    const maxFreq = Math.max(
      ...design.config.dft_frequencies,
      ...design.sources.map((s) => s.parameters.frequency || s.parameters.center_frequency || 0),
    )
    if (maxFreq > 0) {
      const cpw = cellsPerWavelength(maxFreq, Math.max(dx, dim === '2d' ? dy : 0))
      let gridLevel: CheckLevel = 'ok'
      if (cpw < 5) gridLevel = 'error'
      else if (cpw < 10) gridLevel = 'warn'
      result.push({
        label: 'Grid Quality',
        value: `${cpw.toFixed(1)} cells/λ at ${(maxFreq / 1e9).toFixed(2)} GHz`,
        level: gridLevel,
        detail:
          gridLevel === 'error'
            ? 'Fewer than 5 cells per wavelength — results will be inaccurate. Reduce cell size.'
            : gridLevel === 'warn'
              ? 'Fewer than 10 cells per wavelength — accuracy may be limited.'
              : 'Adequate grid resolution (≥10 cells/λ).',
      })
    }

    // 3. Memory estimate
    const mem = memoryEstimate(design.domainSize, design.cellSize, dim)
    let memLevel: CheckLevel = 'ok'
    if (mem > 500 * 1024 * 1024) memLevel = 'error'
    else if (mem > 100 * 1024 * 1024) memLevel = 'warn'
    const nx = Math.ceil(design.domainSize[0] / dx)
    const ny = dim === '2d' ? Math.ceil(design.domainSize[1] / dy) : 1
    result.push({
      label: 'Memory',
      value: `${formatBytes(mem)} (${nx}${dim === '2d' ? `×${ny}` : ''} cells)`,
      level: memLevel,
      detail:
        memLevel === 'error'
          ? 'Exceeds 500 MB — may fail on Lambda. Reduce grid or increase cell size.'
          : memLevel === 'warn'
            ? 'Large grid — solve may be slow.'
            : 'Grid size is manageable.',
    })

    // 4. Estimated solve time
    const estTime = estimateSolveTime(design.domainSize, design.cellSize, dim, steps)
    let timeLevel: CheckLevel = 'ok'
    if (estTime > 300) timeLevel = 'error'
    else if (estTime > 60) timeLevel = 'warn'
    result.push({
      label: 'Est. Time',
      value: formatTime(estTime),
      level: timeLevel,
      detail:
        timeLevel === 'error'
          ? 'Exceeds Lambda 5-min timeout. Reduce time steps or grid size.'
          : timeLevel === 'warn'
            ? 'May take over a minute.'
            : 'Should complete quickly.',
    })

    // 5. Source check
    if (design.sources.length === 0) {
      result.push({
        label: 'Sources',
        value: 'None',
        level: 'error',
        detail: 'At least one source is required to run a simulation.',
      })
    }

    return result
  }, [
    design.cellSize,
    design.domainSize,
    design.dimensionality,
    design.config.courant_number,
    design.config.num_time_steps,
    design.config.dft_frequencies,
    design.sources,
  ])

  const worstLevel = checks.reduce<CheckLevel>(
    (w, c) => (c.level === 'error' ? 'error' : c.level === 'warn' && w !== 'error' ? 'warn' : w),
    'ok',
  )

  const isBusy = solver.status === 'solving' || solver.status === 'postprocessing'
  const canRun = !isBusy && design.sources.length > 0

  // ---------- DFT dialog helpers ----------
  const handleGenerateDftFrequencies = () => {
    const freqs: number[] = []
    for (let i = 0; i < dftPoints; i++) {
      const f = dftLogScale
        ? dftStart * Math.pow(dftStop / dftStart, i / Math.max(dftPoints - 1, 1))
        : dftStart + ((dftStop - dftStart) * i) / Math.max(dftPoints - 1, 1)
      freqs.push(parseFloat((f * 1e9).toPrecision(6))) // GHz → Hz
    }
    dispatch(setConfig({ dft_frequencies: freqs }))
    setDftDialogOpen(false)
  }

  const handleAddManualFreq = () => {
    const val = parseFloat(manualFreq)
    if (!isNaN(val) && val > 0) {
      const hz = val * 1e9
      const existing = design.config.dft_frequencies || []
      if (!existing.includes(hz)) {
        dispatch(setConfig({ dft_frequencies: [...existing, hz].sort((a, b) => a - b) }))
      }
      setManualFreq('')
    }
  }

  const handleRemoveDftFreq = (freq: number) => {
    dispatch(
      setConfig({
        dft_frequencies: (design.config.dft_frequencies || []).filter((f) => f !== freq),
      }),
    )
  }

  // ---------- Mode diagram helper ----------
  const modeDescription =
    solver.mode === 'tm'
      ? 'TM mode: Ez polarized (out of plane), Hx and Hy in plane'
      : 'TE mode: Hz polarized (out of plane), Ex and Ey in plane'

  // ---------- Progress ----------
  const progressLabel = useMemo(() => {
    switch (solver.status) {
      case 'idle':
        return null
      case 'solving':
        return `Solving… ${solver.progress}%`
      case 'postprocessing':
        return 'Post-processing results…'
      case 'completed':
        return `Completed in ${solver.results?.solve_time_s.toFixed(2)}s`
      case 'failed':
        return 'Failed'
      default:
        return null
    }
  }, [solver.status, solver.progress, solver.results?.solve_time_s])

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ================================================================ */}
      {/* 1. Pre-Solve Checks */}
      {/* ================================================================ */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          {worstLevel === 'ok' && <OkIcon color="success" fontSize="small" />}
          {worstLevel === 'warn' && <WarnIcon color="warning" fontSize="small" />}
          {worstLevel === 'error' && <ErrIcon color="error" fontSize="small" />}
          <Typography variant="subtitle2">Pre-Solve Checks</Typography>
        </Stack>

        <Stack spacing={0.5}>
          {checks.map((c) => (
            <Tooltip key={c.label} title={c.detail} placement="right" arrow>
              <Stack direction="row" alignItems="center" spacing={1}>
                {c.level === 'ok' && <OkIcon color="success" sx={{ fontSize: 16 }} />}
                {c.level === 'warn' && <WarnIcon color="warning" sx={{ fontSize: 16 }} />}
                {c.level === 'error' && <ErrIcon color="error" sx={{ fontSize: 16 }} />}
                <Typography variant="body2" sx={{ minWidth: 100 }}>
                  {c.label}:
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {c.value}
                </Typography>
              </Stack>
            </Tooltip>
          ))}
        </Stack>
      </Paper>

      {/* ================================================================ */}
      {/* 2. Solver Configuration */}
      {/* ================================================================ */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Solver Configuration
        </Typography>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Time Steps"
            type="number"
            size="small"
            value={design.config.num_time_steps}
            onChange={(e) => dispatch(setConfig({ num_time_steps: +e.target.value }))}
            inputProps={{ min: 1 }}
          />
          <TextField
            label="Courant Number"
            type="number"
            size="small"
            value={design.config.courant_number}
            onChange={(e) => dispatch(setConfig({ courant_number: +e.target.value }))}
            inputProps={{ step: 0.01, min: 0.01, max: 1.0 }}
          />
          <TextField
            label="Auto-Shutoff"
            type="number"
            size="small"
            value={design.config.auto_shutoff_threshold}
            onChange={(e) => dispatch(setConfig({ auto_shutoff_threshold: +e.target.value }))}
            inputProps={{ step: 1e-7 }}
          />
        </Stack>

        {/* Mode selector (2D only) */}
        {design.dimensionality === '2d' && (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Mode</InputLabel>
                <Select
                  value={solver.mode}
                  label="Mode"
                  onChange={(e) => dispatch(setMode(e.target.value as 'tm' | 'te'))}
                >
                  <MenuItem value="tm">TM (Ez, Hx, Hy)</MenuItem>
                  <MenuItem value="te">TE (Hz, Ex, Ey)</MenuItem>
                </Select>
              </FormControl>
              <Tooltip title={modeDescription}>
                <InfoIcon fontSize="small" color="action" />
              </Tooltip>
            </Stack>

            {/* Mode diagram */}
            <Paper
              variant="outlined"
              sx={{
                mt: 1,
                p: 1.5,
                bgcolor: 'grey.50',
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {solver.mode === 'tm' ? (
                <>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    TM Polarization (Ez out of plane)
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {'  Hy →   Ez ⊙   Hx ↑'}
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {'  ───────────────────'}
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {'  E-field: Ez (perpendicular to xy-plane)'}
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {'  H-field: Hx, Hy (in xy-plane)'}
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    TE Polarization (Hz out of plane)
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {'  Ey →   Hz ⊙   Ex ↑'}
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {'  ───────────────────'}
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {'  H-field: Hz (perpendicular to xy-plane)'}
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {'  E-field: Ex, Ey (in xy-plane)'}
                  </Typography>
                </>
              )}
            </Paper>
          </Box>
        )}

        {/* DFT Frequencies */}
        <Divider sx={{ my: 1 }} />
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle2">DFT Frequencies</Typography>
          <IconButton size="small" onClick={() => setDftDialogOpen(true)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Stack>

        {(design.config.dft_frequencies?.length ?? 0) === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No DFT frequencies configured. Click ⚙ to add.
          </Typography>
        ) : (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {design.config.dft_frequencies.map((f) => (
              <Chip
                key={f}
                label={`${(f / 1e9).toFixed(3)} GHz`}
                size="small"
                onDelete={() => handleRemoveDftFreq(f)}
                variant="outlined"
              />
            ))}
          </Stack>
        )}
      </Paper>

      {/* ================================================================ */}
      {/* 3. Run Button + Progress */}
      {/* ================================================================ */}
      <Button
        variant="contained"
        color="primary"
        size="large"
        startIcon={
          isBusy ? <CircularProgress size={20} color="inherit" /> : <RunIcon />
        }
        disabled={!canRun}
        onClick={onRunSimulation}
        fullWidth
      >
        {solver.status === 'solving'
          ? 'Simulating…'
          : solver.status === 'postprocessing'
            ? 'Post-processing…'
            : 'Run FDTD Simulation'}
      </Button>

      {isBusy && (
        <Box>
          <LinearProgress variant="indeterminate" />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {progressLabel}
          </Typography>
        </Box>
      )}

      {solver.error && <Alert severity="error">{solver.error}</Alert>}

      {worstLevel === 'error' && solver.status === 'idle' && (
        <Alert severity="warning">
          Pre-solve checks have errors. The simulation may fail or produce inaccurate results.
        </Alert>
      )}

      {/* ================================================================ */}
      {/* 4. Results Summary */}
      {/* ================================================================ */}
      {solver.status === 'completed' && solver.results && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <OkIcon color="success" fontSize="small" />
            <Typography variant="subtitle2">Results Summary</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="body2">
              Dimensionality: {solver.results.dimensionality}
              {solver.results.mode !== 'tm' ? ` (${solver.results.mode.toUpperCase()})` : ''}
            </Typography>
            <Typography variant="body2">
              Time steps: {solver.results.total_time_steps}
            </Typography>
            <Typography variant="body2">dt: {solver.results.dt.toExponential(3)} s</Typography>
            <Typography variant="body2">
              Solve time: {solver.results.solve_time_s.toFixed(3)} s
            </Typography>
            <Typography variant="body2">
              Probes recorded: {solver.results.probe_data.length}
            </Typography>
            {solver.results.probe_data.map((p) => (
              <Typography key={p.name} variant="body2" sx={{ ml: 2 }}>
                • {p.name} ({p.field_component}): {p.values.length} samples, peak ={' '}
                {Math.max(...p.values.map(Math.abs)).toExponential(3)}
              </Typography>
            ))}
            {Object.keys(solver.results.dft_results || {}).length > 0 && (
              <Typography variant="body2">
                DFT results: {Object.keys(solver.results.dft_results).length} frequency points
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      {/* ================================================================ */}
      {/* DFT Configuration Dialog */}
      {/* ================================================================ */}
      <Dialog open={dftDialogOpen} onClose={() => setDftDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>DFT Frequency Configuration</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Configure frequencies for on-the-fly DFT computation during the FDTD run. The solver
            will accumulate DFT data at these frequencies without storing full time history.
          </Typography>

          {/* Range builder */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Frequency Range
          </Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
            <TextField
              label="Start (GHz)"
              type="number"
              size="small"
              value={dftStart}
              onChange={(e) => setDftStart(+e.target.value)}
              inputProps={{ min: 0.001, step: 0.1 }}
            />
            <TextField
              label="Stop (GHz)"
              type="number"
              size="small"
              value={dftStop}
              onChange={(e) => setDftStop(+e.target.value)}
              inputProps={{ min: 0.001, step: 0.1 }}
            />
            <TextField
              label="Points"
              type="number"
              size="small"
              value={dftPoints}
              onChange={(e) => setDftPoints(+e.target.value)}
              inputProps={{ min: 1, max: 100 }}
              sx={{ maxWidth: 100 }}
            />
          </Stack>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={dftLogScale}
                onChange={(e) => setDftLogScale(e.target.checked)}
              />
            }
            label="Log scale"
          />

          {/* Preview */}
          {dftStart > 0 && dftStop > dftStart && dftPoints > 0 && (
            <Box sx={{ mt: 1, mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Preview:{' '}
                {Array.from({ length: Math.min(dftPoints, 8) }, (_, i) => {
                  const f = dftLogScale
                    ? dftStart * Math.pow(dftStop / dftStart, i / Math.max(dftPoints - 1, 1))
                    : dftStart + ((dftStop - dftStart) * i) / Math.max(dftPoints - 1, 1)
                  return `${f.toFixed(2)}`
                }).join(', ')}
                {dftPoints > 8 ? ` … (${dftPoints} total)` : ''} GHz
              </Typography>

              {/* Grid quality preview */}
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                λ/Δx at {dftStop.toFixed(1)} GHz:{' '}
                {cellsPerWavelength(dftStop * 1e9, design.cellSize[0]).toFixed(1)} cells/λ
                {cellsPerWavelength(dftStop * 1e9, design.cellSize[0]) < 10 && ' ⚠'}
              </Typography>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Manual entry */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Manual Entry
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Frequency (GHz)"
              type="number"
              size="small"
              value={manualFreq}
              onChange={(e) => setManualFreq(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddManualFreq()
              }}
              inputProps={{ step: 0.1 }}
            />
            <Button size="small" startIcon={<AddIcon />} onClick={handleAddManualFreq}>
              Add
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDftDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleGenerateDftFrequencies}
            disabled={dftStart <= 0 || dftStop <= dftStart || dftPoints <= 0}
          >
            Generate Frequencies
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default FdtdSolverTab
