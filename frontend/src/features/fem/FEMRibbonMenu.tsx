/**
 * FEMRibbonMenu — Tab navigation + context-specific toolbar actions.
 *
 * Tabs: Geometry & Mesh | Physics | Solver | Results
 * Each tab shows relevant action buttons in the toolbar area.
 */

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
import { generateFEMMesh } from '@/api/femPreprocessor'
import type { FEMTab } from './FEMDesignPage'
import type { MeshStatus } from '@/types/femMesh'
import type { SolveStatus } from '@/types/femSolver'

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

        {currentTab === 'solver' && (
          <ButtonGroup size="small" variant="outlined">
            <Tooltip title="Run FEM solver">
              <span>
                <Button
                  startIcon={<SolveIcon />}
                  disabled={meshStatus !== 'ready' || solveStatus === 'solving'}
                  color="primary"
                  variant="contained"
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
              <Button startIcon={<ExportIcon />}>Export VTK</Button>
            </Tooltip>
          </ButtonGroup>
        )}
      </Box>

      {/* Progress bar for mesh/solve */}
      {(meshStatus === 'generating' || solveStatus === 'solving') && (
        <LinearProgress sx={{ mt: 0.5 }} />
      )}
    </Box>
  )
}

export default FEMRibbonMenu
