/**
 * GeometryCanvas — 2D orthographic Three.js canvas.
 *
 * Layers:
 *  1. Grid (background)
 *  2. Geometry bodies (filled surfaces)
 *  3. Geometry edges (stroked lines)
 *  4. Mesh wireframe (when mesh is ready)
 *  5. Tool preview (rubber-band line / ghost shape)
 *  6. Selection highlight
 *
 * Pan: middle-mouse or Ctrl+left-drag
 * Zoom: scroll wheel
 * Click: tool action or selection
 */

import { useRef, useCallback, useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import {
  selectFEMGeometryOps,
  selectFEMMesh,
  selectFEMMeshStatus,
  selectFEMActiveTool,
  selectFEMSelectedEntity,
  addGeometryOperation,
  addPendingPoint,
  setPreviewPoint,
  resetToolState,
  selectEntity,
} from '@/store/femDesignSlice'
import { canvasToWorld, worldToCanvas, computeGridSpacing } from './canvasUtils'
import type { FEMTab } from './FEMDesignPage'
import type { GeoOperation, ToolType, ToolState } from '@/types/femGeometry'
import type { FEMMesh } from '@/types/femMesh'

// ── Constants ─────────────────────────────────────────────────
const GRID_COLOR = '#e0e0e0'
const GRID_AXIS_COLOR = '#bdbdbd'
const BODY_FILL = 'rgba(66, 165, 245, 0.15)'
const BODY_STROKE = '#1e88e5'
const EDGE_COLOR = '#333333'
const MESH_WIRE_COLOR = 'rgba(100, 100, 100, 0.4)'
const SELECTION_COLOR = '#ff9800'
const PREVIEW_COLOR = '#42a5f5'

interface GeometryCanvasProps {
  currentTab: FEMTab
}

/** Draw an infinite-extent grid scaled to current zoom. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  offset: { x: number; y: number },
  zoom: number,
  w: number,
  h: number,
) {
  // Dynamic grid spacing based on zoom
  const spacing = computeGridSpacing(zoom)

  const left = offset.x - w / (2 * zoom)
  const right = offset.x + w / (2 * zoom)
  const bottom = offset.y - h / (2 * zoom)
  const top = offset.y + h / (2 * zoom)

  const startX = Math.floor(left / spacing) * spacing
  const startY = Math.floor(bottom / spacing) * spacing

  ctx.lineWidth = 0.5
  ctx.strokeStyle = GRID_COLOR

  // Vertical lines
  for (let x = startX; x <= right; x += spacing) {
    const [px] = worldToCanvas(x, 0, offset, zoom, w, h)
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, h)
    ctx.stroke()
  }

  // Horizontal lines
  for (let y = startY; y <= top; y += spacing) {
    const [, py] = worldToCanvas(0, y, offset, zoom, w, h)
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(w, py)
    ctx.stroke()
  }

  // Draw axes
  ctx.lineWidth = 1
  ctx.strokeStyle = GRID_AXIS_COLOR
  const [ax] = worldToCanvas(0, 0, offset, zoom, w, h)
  const [, ay] = worldToCanvas(0, 0, offset, zoom, w, h)
  ctx.beginPath()
  ctx.moveTo(ax, 0)
  ctx.lineTo(ax, h)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, ay)
  ctx.lineTo(w, ay)
  ctx.stroke()
}

/** Draw geometry operations as 2D shapes. */
function drawGeometry(
  ctx: CanvasRenderingContext2D,
  ops: GeoOperation[],
  offset: { x: number; y: number },
  zoom: number,
  w: number,
  h: number,
  selectedEntityId: string | null,
) {
  for (const op of ops) {
    const p = op.params as Record<string, number | string>

    ctx.lineWidth = 2
    ctx.strokeStyle = BODY_STROKE
    ctx.fillStyle = BODY_FILL

    if (op.type === 'add_rectangle') {
      const cx = Number(p.center_x ?? 0)
      const cy = Number(p.center_y ?? 0)
      const rw = Number(p.width ?? 1)
      const rh = Number(p.height ?? 1)
      const [px, py] = worldToCanvas(cx - rw / 2, cy + rh / 2, offset, zoom, w, h)
      const pw = rw * zoom
      const ph = rh * zoom
      ctx.fillRect(px, py, pw, ph)
      if (p.tag === selectedEntityId) {
        ctx.strokeStyle = SELECTION_COLOR
        ctx.lineWidth = 3
      }
      ctx.strokeRect(px, py, pw, ph)
    } else if (op.type === 'add_circle') {
      const cx = Number(p.center_x ?? 0)
      const cy = Number(p.center_y ?? 0)
      const r = Number(p.radius ?? 1)
      const [px, py] = worldToCanvas(cx, cy, offset, zoom, w, h)
      ctx.beginPath()
      ctx.arc(px, py, r * zoom, 0, Math.PI * 2)
      ctx.fill()
      if (p.tag === selectedEntityId) {
        ctx.strokeStyle = SELECTION_COLOR
        ctx.lineWidth = 3
      }
      ctx.stroke()
    } else if (op.type === 'add_ellipse') {
      const cx = Number(p.center_x ?? 0)
      const cy = Number(p.center_y ?? 0)
      const rx = Number(p.semi_axis_a ?? 1)
      const ry = Number(p.semi_axis_b ?? 0.5)
      const [px, py] = worldToCanvas(cx, cy, offset, zoom, w, h)
      ctx.beginPath()
      ctx.ellipse(px, py, rx * zoom, ry * zoom, 0, 0, Math.PI * 2)
      ctx.fill()
      if (p.tag === selectedEntityId) {
        ctx.strokeStyle = SELECTION_COLOR
        ctx.lineWidth = 3
      }
      ctx.stroke()
    } else if (op.type === 'add_point') {
      const x = Number(p.x ?? 0)
      const y = Number(p.y ?? 0)
      const [px, py] = worldToCanvas(x, y, offset, zoom, w, h)
      ctx.fillStyle = p.tag === selectedEntityId ? SELECTION_COLOR : EDGE_COLOR
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fill()
    } else if (op.type === 'add_line') {
      const x1 = Number(p.start_x ?? 0)
      const y1 = Number(p.start_y ?? 0)
      const x2 = Number(p.end_x ?? 0)
      const y2 = Number(p.end_y ?? 0)
      const [px1, py1] = worldToCanvas(x1, y1, offset, zoom, w, h)
      const [px2, py2] = worldToCanvas(x2, y2, offset, zoom, w, h)
      if (p.tag === selectedEntityId) {
        ctx.strokeStyle = SELECTION_COLOR
        ctx.lineWidth = 3
      } else {
        ctx.strokeStyle = EDGE_COLOR
      }
      ctx.beginPath()
      ctx.moveTo(px1, py1)
      ctx.lineTo(px2, py2)
      ctx.stroke()
    }

    // Reset styles
    ctx.strokeStyle = BODY_STROKE
    ctx.lineWidth = 2
    ctx.fillStyle = BODY_FILL
  }
}

/** Draw mesh wireframe. */
function drawMesh(
  ctx: CanvasRenderingContext2D,
  mesh: FEMMesh,
  offset: { x: number; y: number },
  zoom: number,
  w: number,
  h: number,
) {
  ctx.strokeStyle = MESH_WIRE_COLOR
  ctx.lineWidth = 0.5

  for (const elem of mesh.elements) {
    const nodeCoords = elem.nodeIds.map((nid) => {
      const node = mesh.nodes.find((n) => n.id === nid)
      if (!node) return [0, 0] as [number, number]
      return worldToCanvas(node.coords[0], node.coords[1], offset, zoom, w, h)
    })

    if (nodeCoords.length < 3) continue

    ctx.beginPath()
    ctx.moveTo(nodeCoords[0][0], nodeCoords[0][1])
    // For tri6, only draw the first 3 (corner) nodes for the wireframe
    const corners = elem.elementType === 'tri6' ? 3 : nodeCoords.length
    for (let i = 1; i < corners; i++) {
      ctx.lineTo(nodeCoords[i][0], nodeCoords[i][1])
    }
    ctx.closePath()
    ctx.stroke()
  }
}

/** Draw tool preview (rubber-band). */
function drawToolPreview(
  ctx: CanvasRenderingContext2D,
  tool: ToolType,
  toolState: ToolState,
  offset: { x: number; y: number },
  zoom: number,
  w: number,
  h: number,
) {
  if (tool === 'select' || !toolState.previewPoint) return

  ctx.setLineDash([6, 4])
  ctx.strokeStyle = PREVIEW_COLOR
  ctx.lineWidth = 1.5

  const [mx, my] = toolState.previewPoint

  if (tool === 'line' && toolState.pendingPoints.length === 1) {
    const [sx, sy] = toolState.pendingPoints[0]
    const [px1, py1] = worldToCanvas(sx, sy, offset, zoom, w, h)
    const [px2, py2] = worldToCanvas(mx, my, offset, zoom, w, h)
    ctx.beginPath()
    ctx.moveTo(px1, py1)
    ctx.lineTo(px2, py2)
    ctx.stroke()
  } else if (tool === 'rectangle' && toolState.pendingPoints.length === 1) {
    const [sx, sy] = toolState.pendingPoints[0]
    const [px1, py1] = worldToCanvas(sx, sy, offset, zoom, w, h)
    const [px2, py2] = worldToCanvas(mx, my, offset, zoom, w, h)
    ctx.strokeRect(
      Math.min(px1, px2),
      Math.min(py1, py2),
      Math.abs(px2 - px1),
      Math.abs(py2 - py1),
    )
  } else if (tool === 'circle' && toolState.pendingPoints.length === 1) {
    const [cx, cy] = toolState.pendingPoints[0]
    const r = Math.hypot(mx - cx, my - cy)
    const [pcx, pcy] = worldToCanvas(cx, cy, offset, zoom, w, h)
    ctx.beginPath()
    ctx.arc(pcx, pcy, r * zoom, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.setLineDash([])

  // Draw pending points as dots
  for (const [px, py] of toolState.pendingPoints) {
    const [cpx, cpy] = worldToCanvas(px, py, offset, zoom, w, h)
    ctx.fillStyle = PREVIEW_COLOR
    ctx.beginPath()
    ctx.arc(cpx, cpy, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function GeometryCanvas({ currentTab }: GeometryCanvasProps) {
  const dispatch = useAppDispatch()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const geometryOps = useAppSelector(selectFEMGeometryOps)
  const mesh = useAppSelector(selectFEMMesh)
  const meshStatus = useAppSelector(selectFEMMeshStatus)
  const activeTool = useAppSelector(selectFEMActiveTool)
  const selectedEntity = useAppSelector(selectFEMSelectedEntity)
  const toolState = useAppSelector((s) => s.femDesign.toolState)
  const showMeshOverlay = useAppSelector((s) => s.femSolver.showMeshOverlay)

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(100) // pixels per unit
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasSize.w * dpr
    canvas.height = canvasSize.h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Clear
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h)
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h)

    // 1. Grid
    drawGrid(ctx, offset, zoom, canvasSize.w, canvasSize.h)

    // 2+3. Geometry
    drawGeometry(ctx, geometryOps, offset, zoom, canvasSize.w, canvasSize.h, selectedEntity.id)

    // 4. Mesh wireframe
    if (mesh && (meshStatus === 'ready' || meshStatus === 'stale') && showMeshOverlay) {
      drawMesh(ctx, mesh, offset, zoom, canvasSize.w, canvasSize.h)
    }

    // 5. Tool preview
    drawToolPreview(ctx, activeTool, toolState, offset, zoom, canvasSize.w, canvasSize.h)

    // Coordinate label (bottom-left)
    ctx.fillStyle = '#666'
    ctx.font = '11px monospace'
    ctx.fillText(`Zoom: ${(zoom).toFixed(0)} px/unit`, 8, canvasSize.h - 8)
  }, [canvasSize, offset, zoom, geometryOps, mesh, meshStatus, activeTool, toolState, selectedEntity.id, showMeshOverlay])

  // Pan/zoom handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Middle mouse or Ctrl+left → pan
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        isPanning.current = true
        panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
        e.preventDefault()
        return
      }

      // Left click → tool action
      if (e.button === 0 && !e.ctrlKey) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        const [wx, wy] = canvasToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          offset,
          zoom,
          canvasSize.w,
          canvasSize.h,
        )

        handleToolClick(wx, wy)
      }
    },
    [offset, zoom, canvasSize, activeTool],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanning.current) {
        const dx = (e.clientX - panStart.current.x) / zoom
        const dy = -(e.clientY - panStart.current.y) / zoom
        setOffset({ x: panStart.current.ox - dx, y: panStart.current.oy - dy })
        return
      }

      // Update preview point
      if (activeTool !== 'select') {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return
        const [wx, wy] = canvasToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          offset,
          zoom,
          canvasSize.w,
          canvasSize.h,
        )
        dispatch(setPreviewPoint([wx, wy]))
      }
    },
    [offset, zoom, canvasSize, activeTool, dispatch],
  )

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      setZoom((z) => Math.max(10, Math.min(10000, z * factor)))
    },
    [],
  )

  // Tool click handler — creates geometry operations
  const handleToolClick = useCallback(
    (wx: number, wy: number) => {
      if (activeTool === 'select') {
        // Selection — simplified: deselect for now
        dispatch(selectEntity({ id: null, type: null }))
        return
      }

      if (activeTool === 'point') {
        dispatch(
          addGeometryOperation({
            type: 'add_point',
            params: { x: wx, y: wy, tag: `pt_${Date.now()}` },
          }),
        )
        return
      }

      if (activeTool === 'line') {
        if (toolState.pendingPoints.length === 0) {
          dispatch(addPendingPoint([wx, wy]))
        } else {
          const [sx, sy] = toolState.pendingPoints[0]
          dispatch(
            addGeometryOperation({
              type: 'add_line',
              params: {
                start_x: sx,
                start_y: sy,
                end_x: wx,
                end_y: wy,
                tag: `line_${Date.now()}`,
              },
            }),
          )
          dispatch(resetToolState())
        }
        return
      }

      if (activeTool === 'rectangle') {
        if (toolState.pendingPoints.length === 0) {
          dispatch(addPendingPoint([wx, wy]))
        } else {
          const [sx, sy] = toolState.pendingPoints[0]
          const cx = (sx + wx) / 2
          const cy = (sy + wy) / 2
          const rw = Math.abs(wx - sx)
          const rh = Math.abs(wy - sy)
          if (rw > 0 && rh > 0) {
            dispatch(
              addGeometryOperation({
                type: 'add_rectangle',
                params: {
                  center_x: cx,
                  center_y: cy,
                  width: rw,
                  height: rh,
                  tag: `rect_${Date.now()}`,
                },
              }),
            )
          }
          dispatch(resetToolState())
        }
        return
      }

      if (activeTool === 'circle') {
        if (toolState.pendingPoints.length === 0) {
          dispatch(addPendingPoint([wx, wy]))
        } else {
          const [cx, cy] = toolState.pendingPoints[0]
          const r = Math.hypot(wx - cx, wy - cy)
          if (r > 0) {
            dispatch(
              addGeometryOperation({
                type: 'add_circle',
                params: {
                  center_x: cx,
                  center_y: cy,
                  radius: r,
                  tag: `circle_${Date.now()}`,
                },
              }),
            )
          }
          dispatch(resetToolState())
        }
        return
      }
    },
    [activeTool, toolState, dispatch],
  )

  // Escape key → cancel tool / deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch(resetToolState())
        dispatch(selectEntity({ id: null, type: null }))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch])

  return (
    <Box
      ref={containerRef}
      sx={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Empty state hint */}
      {geometryOps.length === 0 && currentTab === 'geometry' && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            opacity: 0.5,
          }}
        >
          <Typography variant="h6" color="text.secondary">
            Select a drawing tool to start
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Use the toolbar above to draw rectangles, circles, and other shapes
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default GeometryCanvas
