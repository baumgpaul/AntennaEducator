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

import { useState, useCallback, useRef } from 'react'
import { Box, Divider, IconButton, Tooltip } from '@mui/material'
import {
  ChevronLeft as CollapseLeftIcon,
  ChevronRight as CollapseRightIcon,
} from '@mui/icons-material'
import { useAppSelector } from '@/store/hooks'
import { selectFEMMeshStatus, selectFEMActiveTool } from '@/store/femDesignSlice'
import { selectFEMSolveStatus } from '@/store/femSolverSlice'
import FEMRibbonMenu from './FEMRibbonMenu'
import GeometryCanvas from './GeometryCanvas'
import ModelTree from './ModelTree'
import FEMPropertiesPanel from './FEMPropertiesPanel'
import DrawingToolbar from './DrawingToolbar'

export type FEMTab = 'geometry' | 'physics' | 'solver' | 'results'

function FEMDesignPage() {
  const [currentTab, setCurrentTab] = useState<FEMTab>('geometry')
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [leftWidth, setLeftWidth] = useState(240)
  const [rightWidth, setRightWidth] = useState(280)

  const meshStatus = useAppSelector(selectFEMMeshStatus)
  const solveStatus = useAppSelector(selectFEMSolveStatus)
  const activeTool = useAppSelector(selectFEMActiveTool)

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

          {/* 2D Canvas */}
          <GeometryCanvas currentTab={currentTab} />
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
    </Box>
  )
}

export default FEMDesignPage
