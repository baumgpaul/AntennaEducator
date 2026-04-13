/**
 * ModelTree — Hierarchical tree view for FEM model entities.
 *
 * Geometry/Physics tabs: Surface > Edge nesting with physics annotations.
 * Solver tab: Solver config summary.
 * Results tab: Scalar fields, vector fields, integral quantities.
 *
 * Click entity → select on canvas + show properties.
 * Double-click → inline rename.
 * Right-click → context menu (delete, assign material/BC).
 */

import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Divider,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  Menu,
  MenuItem,
} from '@mui/material'
import {
  ExpandLess,
  ExpandMore,
  Rectangle as RectIcon,
  Circle as CircleIcon,
  Timeline as LineIcon,
  RadioButtonChecked as PointIcon,
  Layers as SurfaceIcon,
  Delete as DeleteIcon,
  Science as MaterialIcon,
  BorderStyle as BCIcon,
  BoltOutlined as ExcitationIcon,
  GridOn as MeshIcon,
} from '@mui/icons-material'
import { useState, useCallback } from 'react'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import {
  selectFEMGeometryOps,
  selectFEMEvaluatedGeometry,
  selectFEMSelectedEntity,
  selectFEMMaterials,
  selectFEMBoundaryConditions,
  selectEntity,
  removeMaterial,
  removeBoundaryCondition,
  removeExcitation,
  renameEntity,
  removeGeometryOperationByTag,
} from '@/store/femDesignSlice'
import { selectFEMSolveResult } from '@/store/femSolverSlice'
import type { FEMTab } from './FEMDesignPage'
import type { GeoSurfaceDef, GeoEdgeDef } from '@/types/femGeometry'
import type { Material, BoundaryCondition, MaterialAssignment } from '@/types/femPhysics'

interface ModelTreeProps {
  currentTab: FEMTab
}

function getSurfaceIcon(primitiveType: string) {
  if (primitiveType === 'rectangle') return <RectIcon fontSize="small" />
  if (primitiveType === 'circle' || primitiveType === 'ellipse')
    return <CircleIcon fontSize="small" />
  if (primitiveType === 'polygon') return <SurfaceIcon fontSize="small" />
  return <SurfaceIcon fontSize="small" />
}

function getEdgeIcon(edgeType: string) {
  if (edgeType === 'arc') return <CircleIcon fontSize="small" sx={{ fontSize: 14 }} />
  return <LineIcon fontSize="small" sx={{ fontSize: 14 }} />
}

/** Find material assigned to a surface. */
function findAssignedMaterial(
  surfaceId: string,
  assignments: MaterialAssignment[],
  materials: Material[],
): Material | null {
  const assignment = assignments.find((a) => a.bodyId === surfaceId)
  if (!assignment) return null
  return materials.find((m) => m.id === assignment.materialId) ?? null
}

/** Find BCs assigned to an edge. */
function findAssignedBC(edgeId: string, bcs: BoundaryCondition[]): BoundaryCondition | null {
  return bcs.find((bc) => bc.edgeIds.includes(edgeId)) ?? null
}

function ModelTree({ currentTab }: ModelTreeProps) {
  const dispatch = useAppDispatch()
  const geometryOps = useAppSelector(selectFEMGeometryOps)
  const evaluatedGeometry = useAppSelector(selectFEMEvaluatedGeometry)
  const selectedEntity = useAppSelector(selectFEMSelectedEntity)
  const materials = useAppSelector(selectFEMMaterials)
  const materialAssignments = useAppSelector((s) => s.femDesign.materialAssignments)
  const boundaryConditions = useAppSelector(selectFEMBoundaryConditions)
  const excitations = useAppSelector((s) => s.femDesign.excitations)
  const meshStatus = useAppSelector((s) => s.femDesign.meshStatus)
  const meshStatistics = useAppSelector((s) => s.femDesign.meshStatistics)
  const solveResult = useAppSelector(selectFEMSolveResult)

  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    geometry: true,
    mesh: true,
    materials: true,
    bcs: true,
    excitations: true,
    results: true,
    points: false,
  })

  // Track which surfaces are expanded to show child edges
  const [surfacesExpanded, setSurfacesExpanded] = useState<Record<string, boolean>>({})

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number
    mouseY: number
    entityId: string
    entityType: 'surface' | 'edge' | 'point'
  } | null>(null)

  const toggleSection = (key: string) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleSurface = (surfaceId: string) => {
    setSurfacesExpanded((prev) => ({ ...prev, [surfaceId]: !prev[surfaceId] }))
  }

  const handleSelectEntity = useCallback(
    (id: string | null, type: 'point' | 'edge' | 'body' | 'surface' | null) => {
      dispatch(selectEntity({ id, type }))
    },
    [dispatch],
  )

  const handleDoubleClick = (id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }

  const handleRenameSubmit = () => {
    if (renamingId && renameValue.trim()) {
      dispatch(renameEntity({ id: renamingId, newName: renameValue.trim() }))
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const handleContextMenu = (
    e: React.MouseEvent,
    entityId: string,
    entityType: 'surface' | 'edge' | 'point',
  ) => {
    e.preventDefault()
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, entityId, entityType })
  }

  const handleContextMenuClose = () => {
    setContextMenu(null)
  }

  // Get surfaces and edges from evaluated geometry (with names)
  const surfaces: GeoSurfaceDef[] = evaluatedGeometry?.surfaces ?? []
  const edges: GeoEdgeDef[] = evaluatedGeometry?.edges ?? []
  const points = evaluatedGeometry?.points ?? []
  // Standalone edges (not belonging to any surface)
  const standaloneEdges = edges.filter((e) => !e.parentSurfaceId)

  const showPhysicsAnnotations = currentTab === 'physics'

  return (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" sx={{ px: 1, py: 0.5, fontWeight: 600 }}>
        Model Tree
      </Typography>
      <Divider sx={{ mb: 0.5 }} />

      {/* ── Geometry section (Geometry & Physics tabs) ── */}
      {(currentTab === 'geometry' || currentTab === 'physics') && (
        <>
          <ListItemButton dense onClick={() => toggleSection('geometry')}>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <SurfaceIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  Geometry
                  <Chip
                    label={`${surfaces.length}S ${edges.length}E`}
                    size="small"
                    sx={{ height: 18, fontSize: 10 }}
                  />
                </Box>
              }
              primaryTypographyProps={{ component: 'div' }}
            />
            {sectionsOpen.geometry ? (
              <ExpandLess fontSize="small" />
            ) : (
              <ExpandMore fontSize="small" />
            )}
          </ListItemButton>
          <Collapse in={sectionsOpen.geometry}>
            <List dense disablePadding>
              {/* Surfaces with nested edges */}
              {surfaces.map((surface) => {
                const isExpanded = surfacesExpanded[surface.id] ?? true
                const isSelected = selectedEntity.id === surface.id
                const childEdges = edges.filter((e) => e.parentSurfaceId === surface.id)
                const assignedMaterial = findAssignedMaterial(
                  surface.id,
                  materialAssignments,
                  materials,
                )

                return (
                  <Box key={surface.id}>
                    {/* Surface row */}
                    <ListItemButton
                      selected={isSelected}
                      sx={{ pl: 3 }}
                      onClick={() => handleSelectEntity(surface.id, 'surface')}
                      onDoubleClick={() => handleDoubleClick(surface.id, surface.name)}
                      onContextMenu={(e) => handleContextMenu(e, surface.id, 'surface')}
                    >
                      <ListItemIcon sx={{ minWidth: 24 }}>
                        {getSurfaceIcon(surface.primitiveType)}
                      </ListItemIcon>
                      {renamingId === surface.id ? (
                        <TextField
                          size="small"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={handleRenameSubmit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSubmit()
                            if (e.key === 'Escape') {
                              setRenamingId(null)
                              setRenameValue('')
                            }
                          }}
                          autoFocus
                          variant="standard"
                          sx={{ flex: 1 }}
                          inputProps={{ style: { fontSize: 13, padding: '2px 4px' } }}
                        />
                      ) : (
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <span>{surface.name}</span>
                              {showPhysicsAnnotations && assignedMaterial && (
                                <Chip
                                  label={assignedMaterial.name}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: 10 }}
                                />
                              )}
                            </Box>
                          }
                          primaryTypographyProps={{ variant: 'body2', noWrap: true, component: 'div' }}
                        />
                      )}
                      {childEdges.length > 0 && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSurface(surface.id)
                          }}
                          sx={{ p: 0 }}
                        >
                          {isExpanded ? (
                            <ExpandLess sx={{ fontSize: 16 }} />
                          ) : (
                            <ExpandMore sx={{ fontSize: 16 }} />
                          )}
                        </IconButton>
                      )}
                    </ListItemButton>

                    {/* Child edges */}
                    <Collapse in={isExpanded}>
                      <List dense disablePadding>
                        {childEdges.map((edge) => {
                          const edgeSelected = selectedEntity.id === edge.id
                          const assignedBC = findAssignedBC(edge.id, boundaryConditions)

                          return (
                            <ListItemButton
                              key={edge.id}
                              selected={edgeSelected}
                              sx={{ pl: 6 }}
                              onClick={() => handleSelectEntity(edge.id, 'edge')}
                              onDoubleClick={() => handleDoubleClick(edge.id, edge.name)}
                              onContextMenu={(e) => handleContextMenu(e, edge.id, 'edge')}
                            >
                              <ListItemIcon sx={{ minWidth: 20 }}>
                                {getEdgeIcon(edge.edgeType)}
                              </ListItemIcon>
                              {renamingId === edge.id ? (
                                <TextField
                                  size="small"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onBlur={handleRenameSubmit}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameSubmit()
                                    if (e.key === 'Escape') {
                                      setRenamingId(null)
                                      setRenameValue('')
                                    }
                                  }}
                                  autoFocus
                                  variant="standard"
                                  sx={{ flex: 1 }}
                                  inputProps={{ style: { fontSize: 12, padding: '2px 4px' } }}
                                />
                              ) : (
                                <ListItemText
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <span style={{ fontSize: 12 }}>{edge.name}</span>
                                      {showPhysicsAnnotations && assignedBC && (
                                        <Chip
                                          label={`${assignedBC.type}=${assignedBC.value}`}
                                          size="small"
                                          variant="outlined"
                                          color={
                                            assignedBC.type === 'dirichlet'
                                              ? 'info'
                                              : assignedBC.type === 'neumann'
                                                ? 'success'
                                                : 'warning'
                                          }
                                          sx={{ height: 14, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }}
                                        />
                                      )}
                                    </Box>
                                  }
                                  primaryTypographyProps={{ variant: 'body2', noWrap: true, component: 'div' }}
                                />
                              )}
                            </ListItemButton>
                          )
                        })}
                      </List>
                    </Collapse>
                  </Box>
                )
              })}

              {/* Standalone edges (not part of any surface) */}
              {standaloneEdges.map((edge) => {
                const edgeSelected = selectedEntity.id === edge.id
                return (
                  <ListItemButton
                    key={edge.id}
                    selected={edgeSelected}
                    sx={{ pl: 3 }}
                    onClick={() => handleSelectEntity(edge.id, 'edge')}
                    onDoubleClick={() => handleDoubleClick(edge.id, edge.name)}
                    onContextMenu={(e) => handleContextMenu(e, edge.id, 'edge')}
                  >
                    <ListItemIcon sx={{ minWidth: 20 }}>
                      {getEdgeIcon(edge.edgeType)}
                    </ListItemIcon>
                    <ListItemText
                      primary={edge.name}
                      primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    />
                  </ListItemButton>
                )
              })}

              {/* Points section (collapsible) */}
              {points.length > 0 && (
                <>
                  <ListItemButton
                    dense
                    sx={{ pl: 3 }}
                    onClick={() => toggleSection('points')}
                  >
                    <ListItemIcon sx={{ minWidth: 20 }}>
                      <PointIcon sx={{ fontSize: 14 }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={`Points (${points.length})`}
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                    {sectionsOpen.points ? (
                      <ExpandLess sx={{ fontSize: 14 }} />
                    ) : (
                      <ExpandMore sx={{ fontSize: 14 }} />
                    )}
                  </ListItemButton>
                  <Collapse in={sectionsOpen.points}>
                    <List dense disablePadding>
                      {points.map((pt) => (
                        <ListItemButton
                          key={pt.id}
                          selected={selectedEntity.id === pt.id}
                          sx={{ pl: 6 }}
                          onClick={() => handleSelectEntity(pt.id, 'point')}
                          onContextMenu={(e) => handleContextMenu(e, pt.id, 'point')}
                        >
                          <ListItemText
                            primary={`${pt.id} (${pt.x}, ${pt.y})`}
                            primaryTypographyProps={{ variant: 'caption' }}
                          />
                        </ListItemButton>
                      ))}
                    </List>
                  </Collapse>
                </>
              )}

              {/* Fallback: show geometry ops if no evaluated geometry */}
              {surfaces.length === 0 && standaloneEdges.length === 0 && (
                <>
                  {geometryOps.length === 0 ? (
                    <Typography variant="caption" sx={{ pl: 4, color: 'text.secondary' }}>
                      No geometry defined
                    </Typography>
                  ) : (
                    <Typography variant="caption" sx={{ pl: 4, color: 'text.secondary' }}>
                      {geometryOps.length} operation(s) — generate mesh to see entities
                    </Typography>
                  )}
                </>
              )}
            </List>
          </Collapse>

          {/* Mesh section */}
          {meshStatus === 'ready' && meshStatistics && (
            <>
              <ListItemButton dense onClick={() => toggleSection('mesh')}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <MeshIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Mesh" />
                {sectionsOpen.mesh ? (
                  <ExpandLess fontSize="small" />
                ) : (
                  <ExpandMore fontSize="small" />
                )}
              </ListItemButton>
              <Collapse in={sectionsOpen.mesh}>
                <Box sx={{ pl: 4, pr: 1, py: 0.5 }}>
                  <Typography variant="caption" display="block">
                    Nodes: {meshStatistics.nNodes}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Elements: {meshStatistics.nElements}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Regions: {meshStatistics.nRegions}
                  </Typography>
                  <Typography variant="caption" display="block">
                    Boundary edges: {meshStatistics.nBoundaryEdges}
                  </Typography>
                </Box>
              </Collapse>
            </>
          )}
        </>
      )}

      {/* ── Physics tab: Materials ── */}
      {currentTab === 'physics' && (
        <>
          <ListItemButton dense onClick={() => toggleSection('materials')}>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <MaterialIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  Materials
                  <Chip
                    label={materials.length}
                    size="small"
                    sx={{ height: 18, fontSize: 11 }}
                  />
                </Box>
              }
              primaryTypographyProps={{ component: 'div' }}
            />
            {sectionsOpen.materials ? (
              <ExpandLess fontSize="small" />
            ) : (
              <ExpandMore fontSize="small" />
            )}
          </ListItemButton>
          <Collapse in={sectionsOpen.materials}>
            <List dense disablePadding>
              {materials.map((mat) => (
                <ListItemButton key={mat.id} sx={{ pl: 4 }}>
                  <ListItemText
                    primary={mat.name}
                    secondary={mat.properties.map((p) => `${p.name}=${p.value}`).join(', ')}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Tooltip title="Remove material">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        dispatch(removeMaterial(mat.id))
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              ))}
              {materials.length === 0 && (
                <Typography variant="caption" sx={{ pl: 4, color: 'text.secondary' }}>
                  No materials assigned
                </Typography>
              )}
            </List>
          </Collapse>

          {/* Boundary Conditions */}
          <ListItemButton dense onClick={() => toggleSection('bcs')}>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <BCIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  Boundary Conditions
                  <Chip
                    label={boundaryConditions.length}
                    size="small"
                    sx={{ height: 18, fontSize: 11 }}
                  />
                </Box>
              }
              primaryTypographyProps={{ component: 'div' }}
            />
            {sectionsOpen.bcs ? (
              <ExpandLess fontSize="small" />
            ) : (
              <ExpandMore fontSize="small" />
            )}
          </ListItemButton>
          <Collapse in={sectionsOpen.bcs}>
            <List dense disablePadding>
              {boundaryConditions.map((bc) => (
                <ListItemButton key={bc.id} sx={{ pl: 4 }}>
                  <ListItemText
                    primary={bc.name}
                    secondary={`${bc.type} = ${bc.value} (${bc.edgeIds.length} edges)`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Tooltip title="Remove BC">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        dispatch(removeBoundaryCondition(bc.id))
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              ))}
              {boundaryConditions.length === 0 && (
                <Typography variant="caption" sx={{ pl: 4, color: 'text.secondary' }}>
                  No boundary conditions
                </Typography>
              )}
            </List>
          </Collapse>

          {/* Excitations */}
          <ListItemButton dense onClick={() => toggleSection('excitations')}>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <ExcitationIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  Excitations
                  <Chip
                    label={excitations.length}
                    size="small"
                    sx={{ height: 18, fontSize: 11 }}
                  />
                </Box>
              }
              primaryTypographyProps={{ component: 'div' }}
            />
            {sectionsOpen.excitations ? (
              <ExpandLess fontSize="small" />
            ) : (
              <ExpandMore fontSize="small" />
            )}
          </ListItemButton>
          <Collapse in={sectionsOpen.excitations}>
            <List dense disablePadding>
              {excitations.map((exc) => (
                <ListItemButton key={exc.id} sx={{ pl: 4 }}>
                  <ListItemText
                    primary={exc.name}
                    secondary={`${exc.type} = ${exc.value}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Tooltip title="Remove excitation">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        dispatch(removeExcitation(exc.id))
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              ))}
              {excitations.length === 0 && (
                <Typography variant="caption" sx={{ pl: 4, color: 'text.secondary' }}>
                  No excitations
                </Typography>
              )}
            </List>
          </Collapse>
        </>
      )}

      {/* ── Results tab ── */}
      {currentTab === 'results' && solveResult && (
        <>
          <ListItemButton dense onClick={() => toggleSection('results')}>
            <ListItemText primary="Solution Fields" />
            {sectionsOpen.results ? (
              <ExpandLess fontSize="small" />
            ) : (
              <ExpandMore fontSize="small" />
            )}
          </ListItemButton>
          <Collapse in={sectionsOpen.results}>
            <List dense disablePadding>
              {solveResult.scalarFields.map((f) => (
                <ListItemButton key={f.name} sx={{ pl: 4 }}>
                  <ListItemText
                    primary={f.name}
                    secondary={`${f.min.toExponential(3)} … ${f.max.toExponential(3)} ${f.unit}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItemButton>
              ))}
              {solveResult.vectorFields.map((f) => (
                <ListItemButton key={f.name} sx={{ pl: 4 }}>
                  <ListItemText
                    primary={f.name}
                    secondary={`max |F| = ${f.maxMagnitude.toExponential(3)} ${f.unit}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItemButton>
              ))}
              {solveResult.integralQuantities.map((q) => (
                <ListItemButton key={q.name} sx={{ pl: 4 }}>
                  <ListItemText
                    primary={q.name}
                    secondary={`${q.value.toExponential(4)} ${q.unit}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Collapse>
        </>
      )}

      {/* Context menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem
          onClick={() => {
            if (contextMenu) {
              handleDoubleClick(contextMenu.entityId, '')
            }
            handleContextMenuClose()
          }}
        >
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenu) {
              dispatch(removeGeometryOperationByTag(contextMenu.entityId))
            }
            handleContextMenuClose()
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Box>
  )
}

export default ModelTree
