/**
 * DrawingToolbar — Horizontal toolbar for FEM geometry drawing tools.
 *
 * Tools: Select, Point, Line, Arc, Rectangle, Circle, Ellipse, Polygon
 * Boolean ops: Opens dialog for Union, Subtract, Intersect.
 * Displayed as icon toggle buttons above the canvas.
 */

import { useState } from 'react'
import { Box, ToggleButton, ToggleButtonGroup, Tooltip, Button, Divider } from '@mui/material'
import {
  NearMe as SelectIcon,
  RadioButtonChecked as PointIcon,
  Timeline as LineIcon,
  ShowChart as ArcIcon,
  CropSquare as RectangleIcon,
  PanoramaFishEye as CircleIcon,
  Adjust as EllipseIcon,
  ChangeHistory as PolygonIcon,
  CallMerge as BooleanIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveTool, selectFEMSelectedEntity, selectFEMEvaluatedGeometry } from '@/store/femDesignSlice'
import type { ToolType } from '@/types/femGeometry'
import BooleanDialog from './BooleanDialog'

interface DrawingToolbarProps {
  activeTool: ToolType
}

const tools: { tool: ToolType; icon: React.ReactNode; label: string }[] = [
  { tool: 'select', icon: <SelectIcon fontSize="small" />, label: 'Select (Esc)' },
  { tool: 'point', icon: <PointIcon fontSize="small" />, label: 'Point' },
  { tool: 'line', icon: <LineIcon fontSize="small" />, label: 'Line (2 clicks)' },
  { tool: 'arc', icon: <ArcIcon fontSize="small" />, label: 'Arc (3 clicks)' },
  { tool: 'rectangle', icon: <RectangleIcon fontSize="small" />, label: 'Rectangle (2 clicks)' },
  { tool: 'circle', icon: <CircleIcon fontSize="small" />, label: 'Circle (center + edge)' },
  { tool: 'ellipse', icon: <EllipseIcon fontSize="small" />, label: 'Ellipse' },
  { tool: 'polygon', icon: <PolygonIcon fontSize="small" />, label: 'Polygon' },
]

function DrawingToolbar({ activeTool }: DrawingToolbarProps) {
  const dispatch = useAppDispatch()
  const selectedEntity = useAppSelector(selectFEMSelectedEntity)
  const evaluatedGeometry = useAppSelector(selectFEMEvaluatedGeometry)
  const [booleanOpen, setBooleanOpen] = useState(false)

  const handleToolChange = (_: unknown, newTool: ToolType | null) => {
    if (newTool) {
      dispatch(setActiveTool(newTool))
    }
  }

  const hasSurfaces = (evaluatedGeometry?.surfaces.length ?? 0) >= 2
  const preselectedSurface =
    selectedEntity.type === 'surface' && selectedEntity.id ? selectedEntity.id : null

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 1,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        gap: 0.5,
        flexWrap: 'wrap',
      }}
    >
      {/* Drawing tools */}
      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        size="small"
        aria-label="Drawing tools"
      >
        {tools.map((t) => (
          <Tooltip key={t.tool} title={t.label}>
            <ToggleButton value={t.tool} aria-label={t.label} sx={{ px: 1 }}>
              {t.icon}
            </ToggleButton>
          </Tooltip>
        ))}
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Boolean operations — opens dialog */}
      <Tooltip title={hasSurfaces ? 'Boolean operation (union, subtract, intersect)' : 'Need at least 2 surfaces'}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={<BooleanIcon fontSize="small" />}
            onClick={() => setBooleanOpen(true)}
            disabled={!hasSurfaces}
            sx={{ textTransform: 'none', fontSize: 12 }}
          >
            Boolean
          </Button>
        </span>
      </Tooltip>

      <BooleanDialog
        open={booleanOpen}
        onClose={() => setBooleanOpen(false)}
        preselectedSurface={preselectedSurface}
      />
    </Box>
  )
}

export default DrawingToolbar
