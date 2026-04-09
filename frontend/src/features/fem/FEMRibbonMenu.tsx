/**
 * FEMRibbonMenu — Tab navigation + context-specific toolbar actions.
 *
 * Tabs: Geometry & Mesh | Physics | Solver | Results
 * Each tab shows relevant action buttons in the toolbar area.
 */

import { useState } from 'react'
import {
  Box,
  Tabs,
  Tab,
  Button,
  ButtonGroup,
  Tooltip,
  Chip,
  LinearProgress,
} from '@mui/material'
import {
  GridOn as MeshIcon,
  PlayArrow as SolveIcon,
  Delete as ClearIcon,
  Undo as UndoIcon,
  FileDownload as ExportIcon,

  Science as MaterialIcon,
  BorderStyle as BCIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  clearGeometry,
  setMeshGenerating,
  setMesh,
  setMeshError,
  selectFEMGeometryOps,
} from '@/store/femDesignSlice'
import {
  clearSolveResult,
} from '@/store/femSolverSlice'
import { runFEMSolve } from '@/store/femSolverThunks'
import { exportVTK, exportCSV } from '@/api/femPostprocessor'
import { generateFEMMesh } from '@/api/femPreprocessor'
import type { FEMTab } from './FEMDesignPage'
import type { MeshStatus } from '@/types/femMesh'
import type { SolveStatus } from '@/types/femSolver'
import AddMaterialDialog from './AddMaterialDialog'
import AddBCDialog from './AddBCDialog'

interface FEMRibbonMenuProps {
  currentTab: FEMTab
  onTabChange: (tab: FEMTab) => void
  meshStatus: MeshStatus
  solveStatus: SolveStatus
}

function FEMRibbonMenu({ currentTab, onTabChange, meshStatus, solveStatus }: FEMRibbonMenuProps) {
  const dispatch = useAppDispatch()
  const geometryOps = useAppSelector(selectFEMGeometryOps)
  const discretization = useAppSelector((s) => s.femDesign.discretization)
  const mesh = useAppSelector((s) => s.femDesign.mesh)
  const solveResult = useAppSelector((s) => s.femSolver.result)
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false)
  const [bcDialogOpen, setBcDialogOpen] = useState(false)

  const handleTabChange = (_: unknown, newValue: FEMTab) => {
    onTabChange(newValue)
  }

  const handleGenerateMesh = async () => {
    if (geometryOps.length === 0) return
    dispatch(setMeshGenerating())
    try {
      const result = await generateFEMMesh(geometryOps, discretization)
      dispatch(setMesh(result))
    } catch (err) {
      dispatch(setMeshError(err instanceof Error ? err.message : 'Mesh generation failed'))
    }
  }

  const handleClearGeometry = () => {
    dispatch(clearGeometry())
    dispatch(clearSolveResult())
  }

  const handleSolve = () => {
    dispatch(runFEMSolve())
  }

  const handleExportVTK = async () => {
    if (!mesh || !solveResult) return
    try {
      const blob = await exportVTK(mesh, solveResult)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fem_results.vtk'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Export error — silently ignored for now
    }
  }

  const handleExportCSV = async () => {
    if (!mesh || !solveResult) return
    try {
      const blob = await exportCSV(mesh, solveResult)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fem_results.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Export error — silently ignored for now
    }
  }

  return (
    <Box sx={{ px: 2, py: 0.5 }}>
      {/* Tab row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Tabs value={currentTab} onChange={handleTabChange} sx={{ minHeight: 36 }}>
          <Tab label="Geometry & Mesh" value="geometry" sx={{ minHeight: 36, py: 0 }} />
          <Tab label="Physics" value="physics" sx={{ minHeight: 36, py: 0 }} />
          <Tab
            label="Solver"
            value="solver"
            sx={{ minHeight: 36, py: 0 }}
            disabled={meshStatus !== 'ready'}
          />
          <Tab
            label="Results"
            value="results"
            sx={{ minHeight: 36, py: 0 }}
            disabled={solveStatus !== 'done'}
          />
        </Tabs>

        {/* Status chips */}
        <Box sx={{ flex: 1 }} />
        {meshStatus === 'ready' && (
          <Chip label="Mesh ready" size="small" color="success" variant="outlined" />
        )}
        {meshStatus === 'generating' && (
          <Chip label="Meshing…" size="small" color="warning" variant="outlined" />
        )}
        {solveStatus === 'solving' && (
          <Chip label="Solving…" size="small" color="info" variant="outlined" />
        )}
        {solveStatus === 'done' && (
          <Chip label="Solved" size="small" color="success" variant="outlined" />
        )}
      </Box>

      {/* Context toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, minHeight: 36 }}>
        {currentTab === 'geometry' && (
          <>
            <ButtonGroup size="small" variant="outlined">
              <Tooltip title="Generate mesh from geometry">
                <span>
                  <Button
                    startIcon={<MeshIcon />}
                    onClick={handleGenerateMesh}
                    disabled={geometryOps.length === 0 || meshStatus === 'generating'}
                  >
                    Mesh
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Clear all geometry">
                <span>
                  <Button
                    startIcon={<ClearIcon />}
                    onClick={handleClearGeometry}
                    disabled={geometryOps.length === 0}
                    color="error"
                  >
                    Clear
                  </Button>
                </span>
              </Tooltip>
            </ButtonGroup>
            <Tooltip title="Undo last operation">
              <span>
                <Button
                  size="small"
                  startIcon={<UndoIcon />}
                  disabled={geometryOps.length === 0}
                  onClick={() => {
                    // Undo is removeGeometryOperation(last index)
                    // Dispatched from component for now
                  }}
                >
                  Undo
                </Button>
              </span>
            </Tooltip>
          </>
        )}

        {currentTab === 'physics' && (
          <ButtonGroup size="small" variant="outlined">
            <Tooltip title="Add material">
              <Button
                startIcon={<MaterialIcon />}
                onClick={() => setMaterialDialogOpen(true)}
              >
                Material
              </Button>
            </Tooltip>
            <Tooltip title="Add boundary condition">
              <Button
                startIcon={<BCIcon />}
                onClick={() => setBcDialogOpen(true)}
              >
                BC
              </Button>
            </Tooltip>
          </ButtonGroup>
        )}

        {currentTab === 'solver' && (
          <ButtonGroup size="small" variant="outlined">
            <Tooltip title="Run FEM solver">
              <span>
                <Button
                  startIcon={<SolveIcon />}
                  disabled={meshStatus !== 'ready' || solveStatus === 'solving'}
                  color="primary"
                  variant="contained"
                  onClick={handleSolve}
                >
                  Solve
                </Button>
              </span>
            </Tooltip>
          </ButtonGroup>
        )}

        {currentTab === 'results' && (
          <ButtonGroup size="small" variant="outlined">
            <Tooltip title="Export results as VTK">
              <Button startIcon={<ExportIcon />} onClick={handleExportVTK}>Export VTK</Button>
            </Tooltip>
            <Tooltip title="Export integral quantities as CSV">
              <Button startIcon={<ExportIcon />} onClick={handleExportCSV}>Export CSV</Button>
            </Tooltip>
          </ButtonGroup>
        )}
      </Box>

      {/* Progress bar for mesh/solve */}
      {(meshStatus === 'generating' || solveStatus === 'solving') && (
        <LinearProgress sx={{ mt: 0.5 }} />
      )}

      {/* Dialogs */}
      <AddMaterialDialog open={materialDialogOpen} onClose={() => setMaterialDialogOpen(false)} />
      <AddBCDialog open={bcDialogOpen} onClose={() => setBcDialogOpen(false)} />
    </Box>
  )
}

export default FEMRibbonMenu
