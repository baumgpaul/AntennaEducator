/**
 * DrawingToolbar — Horizontal toolbar for FEM geometry drawing tools.
 *
 * Tools: Select, Point, Line, Arc, Rectangle, Circle, Ellipse, Polygon
 * Displayed as icon toggle buttons above the canvas.
 */

import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import {
  NearMe as SelectIcon,
  RadioButtonChecked as PointIcon,
  Timeline as LineIcon,
  ShowChart as ArcIcon,
  CropSquare as RectangleIcon,
  PanoramaFishEye as CircleIcon,
  Adjust as EllipseIcon,
  ChangeHistory as PolygonIcon,
} from '@mui/icons-material'
import { useAppDispatch } from '@/store/hooks'
import { setActiveTool } from '@/store/femDesignSlice'
import type { ToolType } from '@/types/femGeometry'

interface DrawingToolbarProps {
  activeTool: ToolType
}

const tools: { tool: ToolType; icon: React.ReactNode; label: string; group: 'select' | 'draw' }[] = [
  { tool: 'select', icon: <SelectIcon fontSize="small" />, label: 'Select (Esc)', group: 'select' },
  { tool: 'point', icon: <PointIcon fontSize="small" />, label: 'Point', group: 'draw' },
  { tool: 'line', icon: <LineIcon fontSize="small" />, label: 'Line (2 clicks)', group: 'draw' },
  { tool: 'arc', icon: <ArcIcon fontSize="small" />, label: 'Arc (3 clicks)', group: 'draw' },
  { tool: 'rectangle', icon: <RectangleIcon fontSize="small" />, label: 'Rectangle (2 clicks)', group: 'draw' },
  { tool: 'circle', icon: <CircleIcon fontSize="small" />, label: 'Circle (center + edge)', group: 'draw' },
  { tool: 'ellipse', icon: <EllipseIcon fontSize="small" />, label: 'Ellipse', group: 'draw' },
  { tool: 'polygon', icon: <PolygonIcon fontSize="small" />, label: 'Polygon', group: 'draw' },
]

function DrawingToolbar({ activeTool }: DrawingToolbarProps) {
  const dispatch = useAppDispatch()

  const handleToolChange = (_: unknown, newTool: ToolType | null) => {
    if (newTool) {
      dispatch(setActiveTool(newTool))
    }
  }

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
      }}
    >
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
    </Box>
  )
}

export default DrawingToolbar
