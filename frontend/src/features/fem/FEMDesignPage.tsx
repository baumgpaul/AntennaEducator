/**
 * FEMDesignPage — Main workspace for 2D FEM simulation.
 *
 * Layout:
 *  ┌─────────────────────────────────────────┐
 *  │  RibbonMenu (tabs + context toolbar)    │
 *  ├──────┬─────────────────────┬────────────┤
 *  │ Tree │  GeometryCanvas     │ Properties │
 *  │      │  (2D Three.js)      │            │
 *  │      │                     │            │
 *  │      │                     │            │
 *  └──────┴─────────────────────┴────────────┘
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Box, Divider, IconButton, Tooltip, Snackbar, Alert } from '@mui/material'
import {
  ChevronLeft as CollapseLeftIcon,
  ChevronRight as CollapseRightIcon,
} from '@mui/icons-material'
import { debounce } from 'lodash'
import { useParams } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { selectFEMMeshStatus, selectFEMActiveTool, loadFEMDesign, resetFEMDesign } from '@/store/femDesignSlice'
import { selectFEMSolveStatus, loadFEMSolver, resetFEMSolver } from '@/store/femSolverSlice'
import { fetchProject, updateProject } from '@/store/projectsSlice'
import FEMRibbonMenu from './FEMRibbonMenu'
import GeometryCanvas from './GeometryCanvas'
import ModelTree from './ModelTree'
import FEMPropertiesPanel from './FEMPropertiesPanel'
import DrawingToolbar from './DrawingToolbar'
import FEMResultsCanvas from './FEMResultsCanvas'
import FEMResultsPanel from './FEMResultsPanel'

export type FEMTab = 'geometry' | 'physics' | 'solver' | 'results'

function FEMDesignPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const dispatch = useAppDispatch()

  const [currentTab, setCurrentTab] = useState<FEMTab>('geometry')
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(280)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showSaveIndicator, setShowSaveIndicator] = useState(false)

  const meshStatus = useAppSelector(selectFEMMeshStatus)
  const solveStatus = useAppSelector(selectFEMSolveStatus)
  const activeTool = useAppSelector(selectFEMActiveTool)

  // Full state slices for persistence
  const femDesignState = useAppSelector((state) => state.femDesign)
  const femSolverState = useAppSelector((state) => state.femSolver)
  const currentProject = useAppSelector((state) => state.projects.currentProject)
  const meshError = useAppSelector((state) => state.femDesign.meshError)

  // Track project loading to skip auto-saves during initial load
  const projectLoadingRef = useRef<boolean>(true)

  // ── Load project on mount ──────────────────────────────
  useEffect(() => {
    if (projectId) {
      projectLoadingRef.current = true
      dispatch(fetchProject(projectId))
    }
    return () => {
      dispatch(resetFEMDesign())
      dispatch(resetFEMSolver())
    }
  }, [projectId, dispatch])

  // ── Restore FEM state from loaded project ──────────────
  useEffect(() => {
    if (!currentProject) return
    if (currentProject.project_type !== 'fem') return

    const ds = currentProject.design_state
    if (ds && ds.fem_design) {
      dispatch(loadFEMDesign(ds.fem_design))
    } else {
      dispatch(resetFEMDesign())
    }

    const sr = currentProject.simulation_results
    if (sr && sr.fem_solver) {
      dispatch(loadFEMSolver(sr.fem_solver))
    } else {
      dispatch(resetFEMSolver())
    }

    setTimeout(() => {
      projectLoadingRef.current = false
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, dispatch])

  // ── Auto-save (debounced) ──────────────────────────────
  const saveProjectDebounced = useRef(
    debounce(async (
      designData: typeof femDesignState,
      solverData: typeof femSolverState,
      pid: string,
    ) => {
      try {
        setSaveStatus('saving')
        setShowSaveIndicator(true)
        await dispatch(updateProject({
          id: pid,
          data: {
            design_state: {
              project_type: 'fem',
              fem_design: {
                geometryOperations: designData.geometryOperations,
                evaluatedGeometry: designData.evaluatedGeometry,
                discretization: designData.discretization,
                mesh: designData.mesh,
                meshStatus: designData.meshStatus,
                meshStatistics: designData.meshStatistics,
                pdeType: designData.pdeType,
                materials: designData.materials,
                materialAssignments: designData.materialAssignments,
                boundaryConditions: designData.boundaryConditions,
                excitations: designData.excitations,
                namingCounters: designData.namingCounters,
                meshStale: designData.meshStale,
                resultsStale: designData.resultsStale,
              },
              version: 1,
            },
            simulation_results: {
              fem_solver: {
                config: solverData.config,
                solveStatus: solverData.solveStatus,
                result: solverData.result,
                selectedField: solverData.selectedField,
                displayMode: solverData.displayMode,
                colorMap: solverData.colorMap,
                colorRange: solverData.colorRange,
                showMeshOverlay: solverData.showMeshOverlay,
                showVectors: solverData.showVectors,
                vectorScale: solverData.vectorScale,
                linePlots: solverData.linePlots,
                linePlotData: solverData.linePlotData,
                probes: solverData.probes,
                probeResults: solverData.probeResults,
              },
            },
          },
        })).unwrap()
        setSaveStatus('saved')
        setTimeout(() => {
          setShowSaveIndicator(false)
          setSaveStatus('idle')
        }, 2000)
      } catch {
        setSaveStatus('error')
        setTimeout(() => {
          setShowSaveIndicator(false)
          setSaveStatus('idle')
        }, 5000)
      }
    }, 2000)
  ).current

  // Trigger auto-save when FEM state changes
  useEffect(() => {
    if (projectLoadingRef.current) return
    if (!projectId) return
    saveProjectDebounced(femDesignState, femSolverState, projectId)
  }, [femDesignState, femSolverState, projectId, saveProjectDebounced])

  // Resize logic for left panel
  const isResizingLeft = useRef(false)
  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizingLeft.current = true
    const startX = e.clientX
    const startWidth = leftWidth
    const onMove = (ev: MouseEvent) => {
      if (!isResizingLeft.current) return
      const newWidth = Math.max(180, Math.min(400, startWidth + ev.clientX - startX))
      setLeftWidth(newWidth)
    }
    const onUp = () => {
      isResizingLeft.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [leftWidth])

  // Resize logic for right panel
  const isResizingRight = useRef(false)
  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizingRight.current = true
    const startX = e.clientX
    const startWidth = rightWidth
    const onMove = (ev: MouseEvent) => {
      if (!isResizingRight.current) return
      const newWidth = Math.max(200, Math.min(450, startWidth - (ev.clientX - startX)))
      setRightWidth(newWidth)
    }
    const onUp = () => {
      isResizingRight.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [rightWidth])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Top ribbon */}
      <FEMRibbonMenu
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        meshStatus={meshStatus}
        solveStatus={solveStatus}
      />

      <Divider />

      {/* Main content area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel: Model tree */}
        {leftPanelOpen && (
          <>
            <Box sx={{ width: leftWidth, minWidth: 180, overflow: 'auto', borderRight: 1, borderColor: 'divider' }}>
              <ModelTree currentTab={currentTab} />
            </Box>
            {/* Resize handle */}
            <Box
              sx={{
                width: 4,
                cursor: 'col-resize',
                '&:hover': { bgcolor: 'primary.main', opacity: 0.3 },
              }}
              onMouseDown={handleLeftResizeStart}
            />
          </>
        )}

        {/* Collapse/expand left panel toggle */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', pt: 1 }}>
          <Tooltip title={leftPanelOpen ? 'Collapse tree' : 'Expand tree'}>
            <IconButton size="small" onClick={() => setLeftPanelOpen((v) => !v)}>
              {leftPanelOpen ? <CollapseLeftIcon fontSize="small" /> : <CollapseRightIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Center: Canvas + drawing toolbar */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          {/* Drawing toolbar (only on geometry tab) */}
          {currentTab === 'geometry' && (
            <DrawingToolbar activeTool={activeTool} />
          )}

          {/* 2D Canvas — use results canvas for results tab */}
          {currentTab === 'results' ? (
            <FEMResultsCanvas />
          ) : (
            <GeometryCanvas currentTab={currentTab} />
          )}

          {/* Bottom results panel (only on results tab) */}
          {currentTab === 'results' && <FEMResultsPanel />}
        </Box>

        {/* Collapse/expand right panel toggle */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', pt: 1 }}>
          <Tooltip title={rightPanelOpen ? 'Collapse properties' : 'Expand properties'}>
            <IconButton size="small" onClick={() => setRightPanelOpen((v) => !v)}>
              {rightPanelOpen ? <CollapseRightIcon fontSize="small" /> : <CollapseLeftIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Right panel: Properties */}
        {rightPanelOpen && (
          <>
            {/* Resize handle */}
            <Box
              sx={{
                width: 4,
                cursor: 'col-resize',
                '&:hover': { bgcolor: 'primary.main', opacity: 0.3 },
              }}
              onMouseDown={handleRightResizeStart}
            />
            <Box sx={{ width: rightWidth, minWidth: 200, overflow: 'auto', borderLeft: 1, borderColor: 'divider' }}>
              <FEMPropertiesPanel currentTab={currentTab} />
            </Box>
          </>
        )}
      </Box>

      {/* Save status indicator */}
      <Snackbar
        open={showSaveIndicator}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={saveStatus === 'error' ? 'error' : saveStatus === 'saved' ? 'success' : 'info'}
          variant="filled"
          sx={{ minWidth: 200 }}
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
        </Alert>
      </Snackbar>

      {/* Mesh error feedback */}
      <Snackbar
        open={!!meshError}
        autoHideDuration={6000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" sx={{ minWidth: 300 }}>
          {meshError}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default FEMDesignPage
