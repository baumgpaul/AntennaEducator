/**
 * ModelTree — Hierarchical tree view for FEM model entities.
 *
 * Shows:
 *  Geometry tab: Bodies, Edges, Points (from geometry operations)
 *  Physics tab:  Materials, Boundary Conditions, Excitations
 *  Solver tab:   Solver config summary
 *  Results tab:  Scalar fields, vector fields, integral quantities
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
} from '@mui/material'
import {
  ExpandLess,
  ExpandMore,
  Rectangle as RectIcon,
  Circle as CircleIcon,
  Timeline as LineIcon,
  RadioButtonChecked as PointIcon,
  Layers as BodyIcon,
  Delete as DeleteIcon,
  Science as MaterialIcon,
  BorderStyle as BCIcon,
  BoltOutlined as ExcitationIcon,
} from '@mui/icons-material'
import { useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import {
  selectFEMGeometryOps,
  selectFEMSelectedEntity,
  selectFEMMaterials,
  selectFEMBoundaryConditions,
  selectEntity,
  removeGeometryOperation,
  removeMaterial,
  removeBoundaryCondition,
  removeExcitation,
} from '@/store/femDesignSlice'
import { selectFEMSolveResult } from '@/store/femSolverSlice'
import type { FEMTab } from './FEMDesignPage'

interface ModelTreeProps {
  currentTab: FEMTab
}

function getOpIcon(type: string) {
  if (type.includes('rectangle')) return <RectIcon fontSize="small" />
  if (type.includes('circle') || type.includes('ellipse')) return <CircleIcon fontSize="small" />
  if (type.includes('line') || type.includes('arc')) return <LineIcon fontSize="small" />
  if (type.includes('point')) return <PointIcon fontSize="small" />
  return <BodyIcon fontSize="small" />
}

function getOpLabel(type: string, params: Record<string, unknown>): string {
  const tag = params.tag as string | undefined
  if (tag) return tag
  return type.replace('add_', '').replace('_', ' ')
}

function ModelTree({ currentTab }: ModelTreeProps) {
  const dispatch = useAppDispatch()
  const geometryOps = useAppSelector(selectFEMGeometryOps)
  const selectedEntity = useAppSelector(selectFEMSelectedEntity)
  const materials = useAppSelector(selectFEMMaterials)
  const boundaryConditions = useAppSelector(selectFEMBoundaryConditions)
  const excitations = useAppSelector((s) => s.femDesign.excitations)
  const solveResult = useAppSelector(selectFEMSolveResult)

  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>({
    geometry: true,
    materials: true,
    bcs: true,
    excitations: true,
    results: true,
  })

  const toggleSection = (key: string) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" sx={{ px: 1, py: 0.5, fontWeight: 600 }}>
        Model Tree
      </Typography>
      <Divider sx={{ mb: 0.5 }} />

      {/* ── Geometry tab ── */}
      {(currentTab === 'geometry' || currentTab === 'physics') && (
        <>
          <ListItemButton dense onClick={() => toggleSection('geometry')}>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <BodyIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  Geometry
                  <Chip label={geometryOps.length} size="small" sx={{ height: 18, fontSize: 11 }} />
                </Box>
              }
            />
            {sectionsOpen.geometry ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </ListItemButton>
          <Collapse in={sectionsOpen.geometry}>
            <List dense disablePadding>
              {geometryOps.map((op, idx) => {
                const tag = (op.params as Record<string, unknown>).tag as string | undefined
                const isSelected = tag === selectedEntity.id
                return (
                  <ListItemButton
                    key={`${op.type}-${idx}`}
                    selected={isSelected}
                    sx={{ pl: 4 }}
                    onClick={() =>
                      dispatch(
                        selectEntity({
                          id: tag ?? null,
                          type: op.type.includes('point')
                            ? 'point'
                            : op.type.includes('line') || op.type.includes('arc')
                              ? 'edge'
                              : 'body',
                        }),
                      )
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 24 }}>
                      {getOpIcon(op.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={getOpLabel(op.type, op.params as Record<string, unknown>)}
                      primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    />
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch(removeGeometryOperation(idx))
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemButton>
                )
              })}
              {geometryOps.length === 0 && (
                <Typography variant="caption" sx={{ pl: 4, color: 'text.secondary' }}>
                  No geometry defined
                </Typography>
              )}
            </List>
          </Collapse>
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
                  <Chip label={materials.length} size="small" sx={{ height: 18, fontSize: 11 }} />
                </Box>
              }
            />
            {sectionsOpen.materials ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </ListItemButton>
          <Collapse in={sectionsOpen.materials}>
            <List dense disablePadding>
              {materials.map((mat) => (
                <ListItemButton key={mat.id} sx={{ pl: 4 }}>
                  <ListItemText
                    primary={mat.name}
                    primaryTypographyProps={{ variant: 'body2' }}
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
                  <Chip label={boundaryConditions.length} size="small" sx={{ height: 18, fontSize: 11 }} />
                </Box>
              }
            />
            {sectionsOpen.bcs ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </ListItemButton>
          <Collapse in={sectionsOpen.bcs}>
            <List dense disablePadding>
              {boundaryConditions.map((bc) => (
                <ListItemButton key={bc.id} sx={{ pl: 4 }}>
                  <ListItemText
                    primary={bc.name}
                    secondary={`${bc.type} = ${bc.value}`}
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
                  <Chip label={excitations.length} size="small" sx={{ height: 18, fontSize: 11 }} />
                </Box>
              }
            />
            {sectionsOpen.excitations ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
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
            {sectionsOpen.results ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
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
    </Box>
  )
}

export default ModelTree
