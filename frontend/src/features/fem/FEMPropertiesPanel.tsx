/**
 * FEMPropertiesPanel — Context-sensitive property inspector.
 *
 * Geometry tab: shows selected entity properties (coords, dimensions)
 *               + mesh discretization settings
 * Physics tab:  PDE type selector, material assignment, BC editor
 * Solver tab:   Solver configuration (linear solver, tolerance, fields)
 * Results tab:  Display mode, color map, color range, mesh overlay toggle
 */

import {
  Box,
  Typography,
  Divider,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Slider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import {
  selectFEMGeometryOps,
  selectFEMSelectedEntity,
  setDiscretization,
  setPDEType,
} from '@/store/femDesignSlice'
import type { FEMDiscretizationSettings } from '@/store/femDesignSlice'
import {
  setFEMSolverConfig,
  setDisplayMode,
  setColorMap,
  toggleMeshOverlay,
  toggleVectors,
  setVectorScale,
  selectFEMSolverConfig,
  selectFEMSolveResult,
  selectFEMSelectedField,
  selectFEMDisplayMode,
  setSelectedField,
} from '@/store/femSolverSlice'
import type { FEMTab } from './FEMDesignPage'
import type { PDEType } from '@/types/femPhysics'
import type { DisplayMode, ColorMapName } from '@/types/femResults'

interface FEMPropertiesPanelProps {
  currentTab: FEMTab
}

function FEMPropertiesPanel({ currentTab }: FEMPropertiesPanelProps) {
  const dispatch = useAppDispatch()

  // Geometry state
  const geometryOps = useAppSelector(selectFEMGeometryOps)
  const selectedEntity = useAppSelector(selectFEMSelectedEntity)
  const discretization = useAppSelector((s) => s.femDesign.discretization)
  const pdeType = useAppSelector((s) => s.femDesign.pdeType)

  // Solver state
  const solverConfig = useAppSelector(selectFEMSolverConfig)
  const solveResult = useAppSelector(selectFEMSolveResult)
  const selectedField = useAppSelector(selectFEMSelectedField)
  const displayMode = useAppSelector(selectFEMDisplayMode)
  const showMeshOverlay = useAppSelector((s) => s.femSolver.showMeshOverlay)
  const showVectors = useAppSelector((s) => s.femSolver.showVectors)
  const vectorScale = useAppSelector((s) => s.femSolver.vectorScale)
  const colorMap = useAppSelector((s) => s.femSolver.colorMap)

  // Find the selected geometry operation
  const selectedOp = selectedEntity.id
    ? geometryOps.find(
        (op) => (op.params as Record<string, unknown>).tag === selectedEntity.id,
      )
    : null

  return (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" sx={{ px: 1, py: 0.5, fontWeight: 600 }}>
        Properties
      </Typography>
      <Divider sx={{ mb: 1 }} />

      {/* ── Geometry tab ── */}
      {currentTab === 'geometry' && (
        <>
          {/* Selected entity properties */}
          {selectedOp ? (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" fontWeight={500}>
                  {String((selectedOp.params as Record<string, unknown>).tag ?? selectedOp.type)}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {Object.entries(selectedOp.params as Record<string, unknown>)
                  .filter(([k]) => k !== 'tag')
                  .map(([key, val]) => (
                    <TextField
                      key={key}
                      label={key}
                      value={String(val)}
                      size="small"
                      fullWidth
                      margin="dense"
                      InputProps={{ readOnly: true }}
                    />
                  ))}
              </AccordionDetails>
            </Accordion>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              Select an entity to view properties
            </Typography>
          )}

          {/* Mesh discretization settings */}
          <Accordion defaultExpanded sx={{ mt: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>
                Mesh Settings
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControl fullWidth size="small" margin="dense">
                <InputLabel>Element Type</InputLabel>
                <Select
                  value={discretization.elementType}
                  label="Element Type"
                  onChange={(e) =>
                    dispatch(
                      setDiscretization({
                        elementType: e.target.value as FEMDiscretizationSettings['elementType'],
                      }),
                    )
                  }
                >
                  <MenuItem value="tri3">Triangle (linear)</MenuItem>
                  <MenuItem value="tri6">Triangle (quadratic)</MenuItem>
                  <MenuItem value="quad4">Quadrilateral (linear)</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="small" margin="dense">
                <InputLabel>Algorithm</InputLabel>
                <Select
                  value={discretization.algorithm}
                  label="Algorithm"
                  onChange={(e) =>
                    dispatch(setDiscretization({ algorithm: e.target.value }))
                  }
                >
                  <MenuItem value="frontal_delaunay">Frontal-Delaunay</MenuItem>
                  <MenuItem value="delaunay">Delaunay</MenuItem>
                  <MenuItem value="meshadapt">MeshAdapt</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Global Element Size"
                value={discretization.globalElementSize}
                size="small"
                fullWidth
                margin="dense"
                onChange={(e) =>
                  dispatch(
                    setDiscretization({
                      globalElementSize:
                        e.target.value === 'auto' ? 'auto' : Number(e.target.value),
                    }),
                  )
                }
              />

              <TextField
                label="Growth Rate"
                value={discretization.growthRate}
                size="small"
                type="number"
                fullWidth
                margin="dense"
                inputProps={{ step: 0.1, min: 1.0, max: 3.0 }}
                onChange={(e) =>
                  dispatch(
                    setDiscretization({ growthRate: Number(e.target.value) }),
                  )
                }
              />

              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={discretization.optimize}
                    onChange={(e) =>
                      dispatch(
                        setDiscretization({ optimize: e.target.checked }),
                      )
                    }
                  />
                }
                label="Optimize mesh"
              />
            </AccordionDetails>
          </Accordion>
        </>
      )}

      {/* ── Physics tab ── */}
      {currentTab === 'physics' && (
        <>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>
                PDE Type
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControl fullWidth size="small">
                <InputLabel>PDE</InputLabel>
                <Select
                  value={pdeType}
                  label="PDE"
                  onChange={(e) =>
                    dispatch(setPDEType(e.target.value as PDEType))
                  }
                >
                  <MenuItem value="electrostatic">Electrostatic</MenuItem>
                  <MenuItem value="current_flow">Current Flow</MenuItem>
                  <MenuItem value="magnetostatic">Magnetostatic</MenuItem>
                  <MenuItem value="eddy_current" disabled>
                    Eddy Current (coming soon)
                  </MenuItem>
                </Select>
              </FormControl>
            </AccordionDetails>
          </Accordion>

          <Typography variant="caption" color="text.secondary" sx={{ px: 1, mt: 1, display: 'block' }}>
            Use the Model Tree to add materials and boundary conditions.
          </Typography>
        </>
      )}

      {/* ── Solver tab ── */}
      {currentTab === 'solver' && (
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={500}>
              Solver Configuration
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <FormControl fullWidth size="small" margin="dense">
              <InputLabel>Linear Solver</InputLabel>
              <Select
                value={solverConfig.linearSolver}
                label="Linear Solver"
                onChange={(e) =>
                  dispatch(
                    setFEMSolverConfig({
                      linearSolver: e.target.value as 'direct' | 'cg' | 'gmres',
                    }),
                  )
                }
              >
                <MenuItem value="direct">Direct (LU)</MenuItem>
                <MenuItem value="cg">CG (iterative)</MenuItem>
                <MenuItem value="gmres">GMRES (iterative)</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Tolerance"
              value={solverConfig.tolerance}
              size="small"
              type="number"
              fullWidth
              margin="dense"
              inputProps={{ step: 1e-9 }}
              onChange={(e) =>
                dispatch(
                  setFEMSolverConfig({ tolerance: Number(e.target.value) }),
                )
              }
            />

            <TextField
              label="Max Iterations"
              value={solverConfig.maxIterations}
              size="small"
              type="number"
              fullWidth
              margin="dense"
              onChange={(e) =>
                dispatch(
                  setFEMSolverConfig({ maxIterations: Number(e.target.value) }),
                )
              }
            />
          </AccordionDetails>
        </Accordion>
      )}

      {/* ── Results tab ── */}
      {currentTab === 'results' && solveResult && (
        <>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>
                Display Options
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControl fullWidth size="small" margin="dense">
                <InputLabel>Field</InputLabel>
                <Select
                  value={selectedField ?? ''}
                  label="Field"
                  onChange={(e) =>
                    dispatch(setSelectedField(e.target.value || null))
                  }
                >
                  {solveResult.scalarFields.map((f) => (
                    <MenuItem key={f.name} value={f.name}>
                      {f.name} [{f.unit}]
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small" margin="dense">
                <InputLabel>Display Mode</InputLabel>
                <Select
                  value={displayMode}
                  label="Display Mode"
                  onChange={(e) =>
                    dispatch(setDisplayMode(e.target.value as DisplayMode))
                  }
                >
                  <MenuItem value="contour">Contour Fill</MenuItem>
                  <MenuItem value="contour_lines">Contour Lines</MenuItem>
                  <MenuItem value="both">Both</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="small" margin="dense">
                <InputLabel>Color Map</InputLabel>
                <Select
                  value={colorMap}
                  label="Color Map"
                  onChange={(e) =>
                    dispatch(setColorMap(e.target.value as ColorMapName))
                  }
                >
                  <MenuItem value="viridis">Viridis</MenuItem>
                  <MenuItem value="jet">Jet</MenuItem>
                  <MenuItem value="coolwarm">Cool-Warm</MenuItem>
                  <MenuItem value="plasma">Plasma</MenuItem>
                  <MenuItem value="inferno">Inferno</MenuItem>
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showMeshOverlay}
                    onChange={() => dispatch(toggleMeshOverlay())}
                  />
                }
                label="Mesh overlay"
              />

              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showVectors}
                    onChange={() => dispatch(toggleVectors())}
                  />
                }
                label="Vector arrows"
              />

              {showVectors && (
                <Box sx={{ px: 1 }}>
                  <Typography variant="caption">Vector scale</Typography>
                  <Slider
                    size="small"
                    value={vectorScale}
                    min={0.1}
                    max={5}
                    step={0.1}
                    onChange={(_, v) =>
                      dispatch(setVectorScale(v as number))
                    }
                  />
                </Box>
              )}
            </AccordionDetails>
          </Accordion>

          {/* Solve info */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={500}>
                Solve Info
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">
                DOFs: {solveResult.nDofs.toLocaleString()}
              </Typography>
              <Typography variant="body2">
                Time: {solveResult.solveTimeMs.toFixed(0)} ms
              </Typography>
              {solveResult.integralQuantities.map((q) => (
                <Typography key={q.name} variant="body2">
                  {q.name}: {q.value.toExponential(4)} {q.unit}
                </Typography>
              ))}
            </AccordionDetails>
          </Accordion>
        </>
      )}
    </Box>
  )
}

export default FEMPropertiesPanel
