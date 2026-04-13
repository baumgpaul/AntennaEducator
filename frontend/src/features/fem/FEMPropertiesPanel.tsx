/**
 * FEMPropertiesPanel — Context-sensitive property inspector.
 *
 * Geometry tab: shows selected entity properties (coords, dimensions)
 *               + mesh discretization settings
 * Physics tab:  PDE type selector, material assignment, BC editor
 * Solver tab:   Solver configuration (linear solver, tolerance, fields)
 * Results tab:  Display mode, color map, color range, mesh overlay toggle
 */

import { useState } from 'react'
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
  Checkbox,
  Button,
  Chip,
  Stack,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import {
  selectFEMGeometryOps,
  selectFEMEvaluatedGeometry,
  selectFEMSelectedEntity,
  selectFEMMaterials,
  selectFEMBoundaryConditions,
  setDiscretization,
  setPDEType,
  assignMaterial,
  addMaterial,
  addBoundaryCondition,
  updateBoundaryCondition,
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
import type { PDEType, BCType } from '@/types/femPhysics'
import { BUILTIN_MATERIALS } from '@/types/femPhysics'
import type { DisplayMode, ColorMapName } from '@/types/femResults'

interface FEMPropertiesPanelProps {
  currentTab: FEMTab
}

// ── Surface material assignment ───────────────────────────────

function SurfaceMaterialSection({
  surfaceId,
  surfaceName,
  assignedMaterialId,
  materials,
  dispatch,
}: {
  surfaceId: string
  surfaceName: string
  assignedMaterialId: string
  materials: { id: string; name: string }[]
  dispatch: ReturnType<typeof useAppDispatch>
}) {
  const [showLibrary, setShowLibrary] = useState(false)

  // Combine user-defined materials + built-in library
  const allMaterials = [
    ...materials,
    ...BUILTIN_MATERIALS.filter((bm) => !materials.some((m) => m.id === bm.id)),
  ]

  return (
    <Accordion defaultExpanded sx={{ mt: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" fontWeight={500}>
          Material — {surfaceName}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <FormControl fullWidth size="small" margin="dense">
          <InputLabel>Assigned Material</InputLabel>
          <Select
            value={assignedMaterialId}
            label="Assigned Material"
            onChange={(e) => {
              const matId = e.target.value as string
              if (matId) {
                // If it's a built-in material not yet in user list, add it
                const exists = materials.some((m) => m.id === matId)
                if (!exists) {
                  const builtin = BUILTIN_MATERIALS.find((bm) => bm.id === matId)
                  if (builtin) {
                    dispatch(addMaterial({
                      id: builtin.id,
                      name: builtin.name,
                      properties: builtin.properties,
                    }))
                  }
                }
                dispatch(assignMaterial({ bodyId: surfaceId, materialId: matId }))
              }
            }}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {allMaterials.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Show library toggle */}
        {!showLibrary && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setShowLibrary(true)}
            sx={{ mt: 0.5, textTransform: 'none' }}
          >
            Custom material
          </Button>
        )}

        {showLibrary && (
          <CustomMaterialForm
            onAdd={(name, epsilonR) => {
              const id = `custom_${Date.now()}`
              dispatch(addMaterial({
                id,
                name,
                properties: [{ name: 'epsilon_r', value: epsilonR, unit: '' }],
              }))
              dispatch(assignMaterial({ bodyId: surfaceId, materialId: id }))
              setShowLibrary(false)
            }}
            onCancel={() => setShowLibrary(false)}
          />
        )}
      </AccordionDetails>
    </Accordion>
  )
}

function CustomMaterialForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, epsilonR: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [epsilonR, setEpsilonR] = useState('1.0')

  return (
    <Box sx={{ mt: 1 }}>
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        size="small"
        fullWidth
        margin="dense"
      />
      <TextField
        label="εᵣ (relative permittivity)"
        value={epsilonR}
        onChange={(e) => setEpsilonR(e.target.value)}
        size="small"
        type="number"
        fullWidth
        margin="dense"
        inputProps={{ step: 0.1, min: 1.0 }}
      />
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button
          size="small"
          variant="contained"
          disabled={!name.trim()}
          onClick={() => onAdd(name.trim(), Number(epsilonR))}
        >
          Add
        </Button>
        <Button size="small" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Box>
  )
}

// ── Edge BC assignment ────────────────────────────────────────

function EdgeBCSection({
  edgeId,
  edgeName,
  existingBC,
  dispatch,
}: {
  edgeId: string
  edgeName: string
  existingBC: { id: string; name: string; type: BCType; value: number | string; edgeIds: string[] } | null
  dispatch: ReturnType<typeof useAppDispatch>
}) {
  const [bcType, setBcType] = useState<BCType>(existingBC?.type ?? 'neumann')
  const [bcValue, setBcValue] = useState(String(existingBC?.value ?? '0'))

  const handleApply = () => {
    const val = Number(bcValue)
    if (existingBC) {
      // Update existing BC to include this edge
      dispatch(updateBoundaryCondition({
        ...existingBC,
        type: bcType,
        value: isNaN(val) ? bcValue : val,
        edgeIds: existingBC.edgeIds.includes(edgeId)
          ? existingBC.edgeIds
          : [...existingBC.edgeIds, edgeId],
      }))
    } else {
      // Create a new BC
      const id = `bc_${Date.now()}`
      dispatch(addBoundaryCondition({
        id,
        name: `${bcType}_${edgeName}`,
        type: bcType,
        value: isNaN(val) ? bcValue : val,
        edgeIds: [edgeId],
      }))
    }
  }

  const bcTypeColor = {
    dirichlet: '#1976d2',
    neumann: '#2e7d32',
    robin: '#ed6c02',
    periodic: '#9c27b0',
  }

  return (
    <Accordion defaultExpanded sx={{ mt: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" fontWeight={500}>
            Boundary Condition — {edgeName}
          </Typography>
          {existingBC ? (
            <Chip
              label={existingBC.type}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.65rem',
                bgcolor: bcTypeColor[existingBC.type] ?? '#9e9e9e',
                color: '#fff',
              }}
            />
          ) : (
            <Chip
              label="neumann 0 (default)"
              size="small"
              variant="outlined"
              sx={{
                height: 18,
                fontSize: '0.65rem',
                borderColor: bcTypeColor.neumann,
                color: bcTypeColor.neumann,
              }}
            />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <FormControl fullWidth size="small" margin="dense">
          <InputLabel>BC Type</InputLabel>
          <Select
            value={bcType}
            label="BC Type"
            onChange={(e) => setBcType(e.target.value as BCType)}
          >
            <MenuItem value="dirichlet">Dirichlet (fixed value)</MenuItem>
            <MenuItem value="neumann">Neumann (flux)</MenuItem>
            <MenuItem value="robin">Robin (mixed)</MenuItem>
          </Select>
        </FormControl>

        <TextField
          label={bcType === 'dirichlet' ? 'Value (φ)' : bcType === 'neumann' ? 'Flux (∂φ/∂n)' : 'Value'}
          value={bcValue}
          onChange={(e) => setBcValue(e.target.value)}
          size="small"
          fullWidth
          margin="dense"
          type="number"
          inputProps={{ step: 0.1 }}
        />

        <Button
          size="small"
          variant="contained"
          onClick={handleApply}
          sx={{ mt: 1, textTransform: 'none' }}
        >
          {existingBC ? 'Update' : 'Apply'}
        </Button>
      </AccordionDetails>
    </Accordion>
  )
}

// ── Field display names ───────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  electric_potential: 'Electric Potential',
  energy_density: 'Energy Density',
  electric_field: 'Electric Field',
  displacement_field: 'Displacement Field (D)',
  power_density: 'Power Density',
  current_density: 'Current Density (J)',
}

function fieldDisplayName(name: string): string {
  return FIELD_LABELS[name] ?? name
}

// ── Main component ────────────────────────────────────────────

function FEMPropertiesPanel({ currentTab }: FEMPropertiesPanelProps) {
  const dispatch = useAppDispatch()

  // Geometry state
  const geometryOps = useAppSelector(selectFEMGeometryOps)
  const evaluatedGeometry = useAppSelector(selectFEMEvaluatedGeometry)
  const selectedEntity = useAppSelector(selectFEMSelectedEntity)
  const discretization = useAppSelector((s) => s.femDesign.discretization)
  const pdeType = useAppSelector((s) => s.femDesign.pdeType)
  const materials = useAppSelector(selectFEMMaterials)
  const boundaryConditions = useAppSelector(selectFEMBoundaryConditions)
  const materialAssignments = useAppSelector((s) => s.femDesign.materialAssignments)

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

  // Find the selected surface or edge from evaluated geometry
  const selectedSurface =
    selectedEntity.type === 'surface' && evaluatedGeometry
      ? evaluatedGeometry.surfaces.find((s) => s.id === selectedEntity.id)
      : null
  const selectedEdge =
    selectedEntity.type === 'edge' && evaluatedGeometry
      ? evaluatedGeometry.edges.find((e) => e.id === selectedEntity.id)
      : null

  // Material assigned to the selected surface
  const surfaceMaterialId = selectedSurface
    ? materialAssignments.find((a) => a.bodyId === selectedSurface.id)?.materialId ?? ''
    : ''

  // BC assigned to the selected edge
  const edgeBC = selectedEdge
    ? boundaryConditions.find((bc) => bc.edgeIds.includes(selectedEdge.id))
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

          {/* Per-entity mesh refinement */}
          {selectedSurface && (
            <Accordion defaultExpanded sx={{ mt: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" fontWeight={500}>
                  Refinement — {selectedSurface.name}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TextField
                  label="Local element size (leave blank = global)"
                  value={discretization.bodySizes[selectedSurface.id] ?? ''}
                  size="small"
                  fullWidth
                  margin="dense"
                  type="number"
                  inputProps={{ step: 0.01, min: 0 }}
                  placeholder={String(discretization.globalElementSize)}
                  onChange={(e) => {
                    const val = e.target.value === '' ? undefined : Number(e.target.value)
                    const next = { ...discretization.bodySizes }
                    if (val === undefined) {
                      delete next[selectedSurface.id]
                    } else {
                      next[selectedSurface.id] = val
                    }
                    dispatch(setDiscretization({ bodySizes: next }))
                  }}
                />
                {/* Per-edge divisions (overrides surface size on individual edges) */}
                {evaluatedGeometry && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                      Edge divisions (override surface size per edge)
                    </Typography>
                    {evaluatedGeometry.edges
                      .filter((e) => e.parentSurfaceId === selectedSurface.id)
                      .map((edge) => (
                        <TextField
                          key={edge.id}
                          label={edge.name}
                          value={discretization.edgeDivisions[edge.id] ?? ''}
                          size="small"
                          fullWidth
                          margin="dense"
                          type="number"
                          inputProps={{ step: 1, min: 1 }}
                          placeholder="auto"
                          onChange={(e) => {
                            const val = e.target.value === '' ? undefined : Math.round(Number(e.target.value))
                            const next = { ...discretization.edgeDivisions }
                            if (val === undefined) {
                              delete next[edge.id]
                            } else {
                              next[edge.id] = val
                            }
                            dispatch(setDiscretization({ edgeDivisions: next }))
                          }}
                        />
                      ))}
                  </>
                )}
              </AccordionDetails>
            </Accordion>
          )}

          {selectedEdge && (
            <Accordion defaultExpanded sx={{ mt: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" fontWeight={500}>
                  Refinement — {selectedEdge.name}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TextField
                  label="Number of divisions (leave blank = auto)"
                  value={discretization.edgeDivisions[selectedEdge.id] ?? ''}
                  size="small"
                  fullWidth
                  margin="dense"
                  type="number"
                  inputProps={{ step: 1, min: 1 }}
                  onChange={(e) => {
                    const val = e.target.value === '' ? undefined : Math.round(Number(e.target.value))
                    const next = { ...discretization.edgeDivisions }
                    if (val === undefined) {
                      delete next[selectedEdge.id]
                    } else {
                      next[selectedEdge.id] = val
                    }
                    dispatch(setDiscretization({ edgeDivisions: next }))
                  }}
                />
              </AccordionDetails>
            </Accordion>
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
          {/* Solver category — always at the top */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={600}>
                Solver Category
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControl fullWidth size="small">
                <InputLabel>Physics</InputLabel>
                <Select
                  value={pdeType}
                  label="Physics"
                  onChange={(e) =>
                    dispatch(setPDEType(e.target.value as PDEType))
                  }
                >
                  <MenuItem value="electrostatic">Electrostatic (∇·εE = ρ)</MenuItem>
                  <MenuItem value="current_flow">Current Flow (∇·σE = 0)</MenuItem>
                  <MenuItem value="magnetostatic">Magnetostatic (∇×H = J)</MenuItem>
                  <MenuItem value="eddy_current" disabled>
                    Eddy Current (coming soon)
                  </MenuItem>
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {pdeType === 'electrostatic' &&
                  'Assigns ε material to each surface. Set Dirichlet (voltage) or Neumann (flux) BCs on edges. No excitation needed for pure electrostatics.'}
                {pdeType === 'current_flow' &&
                  'Assigns σ (conductivity) to surfaces. Fixed-voltage Dirichlet BCs drive current. No sources needed.'}
                {pdeType === 'magnetostatic' &&
                  'Assigns μ to surfaces. Dirichlet BC sets magnetic vector potential. Current sources define excitations.'}
              </Typography>
            </AccordionDetails>
          </Accordion>

          {/* Context-sensitive: Surface selected → material assignment */}
          {selectedSurface && (
            <SurfaceMaterialSection
              surfaceId={selectedSurface.id}
              surfaceName={selectedSurface.name ?? selectedSurface.id}
              assignedMaterialId={surfaceMaterialId}
              materials={materials}
              dispatch={dispatch}
            />
          )}

          {/* Context-sensitive: Edge selected → BC assignment */}
          {selectedEdge && (
            <EdgeBCSection
              edgeId={selectedEdge.id}
              edgeName={selectedEdge.name ?? selectedEdge.id}
              existingBC={edgeBC}
              dispatch={dispatch}
            />
          )}

          {/* Hint when nothing is selected */}
          {!selectedSurface && !selectedEdge && (
            <Typography variant="caption" color="text.secondary" sx={{ px: 1, mt: 1, display: 'block' }}>
              Select a surface to assign a material, or an edge to assign a boundary condition.
            </Typography>
          )}
        </>
      )}

      {/* ── Solver tab ── */}
      {currentTab === 'solver' && (
        <>
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

        {/* Output requests */}
        <Accordion defaultExpanded sx={{ mt: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={500}>
              Output Requests
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Derived fields
            </Typography>
            {[
              { key: 'potential', label: 'Potential (φ)' },
              { key: 'e_field', label: 'E-field (−∇φ)' },
              { key: 'd_field', label: 'D-field (εE)' },
              { key: 'energy_density', label: 'Energy density' },
            ].map(({ key, label }) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    size="small"
                    checked={solverConfig.requestedFields.includes(key)}
                    onChange={(e) => {
                      const fields = e.target.checked
                        ? [...solverConfig.requestedFields, key]
                        : solverConfig.requestedFields.filter((f) => f !== key)
                      dispatch(setFEMSolverConfig({ requestedFields: fields }))
                    }}
                  />
                }
                label={<Typography variant="body2">{label}</Typography>}
                sx={{ display: 'block', ml: 0 }}
              />
            ))}
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Integral quantities
            </Typography>
            {[
              { key: 'energy', label: 'Electric energy' },
              { key: 'charge', label: 'Total charge' },
              { key: 'capacitance', label: 'Capacitance' },
            ].map(({ key, label }) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    size="small"
                    checked={solverConfig.requestedIntegrals.includes(key)}
                    onChange={(e) => {
                      const integrals = e.target.checked
                        ? [...solverConfig.requestedIntegrals, key]
                        : solverConfig.requestedIntegrals.filter((i) => i !== key)
                      dispatch(setFEMSolverConfig({ requestedIntegrals: integrals }))
                    }}
                  />
                }
                label={<Typography variant="body2">{label}</Typography>}
                sx={{ display: 'block', ml: 0 }}
              />
            ))}
          </AccordionDetails>
        </Accordion>
        </>
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
                      {fieldDisplayName(f.name)} [{f.unit}]
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
