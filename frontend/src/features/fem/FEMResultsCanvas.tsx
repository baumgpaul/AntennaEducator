/**
 * FEMResultsCanvas — 2D field visualization with vertex-colored triangles.
 *
 * Renders:
 *  1. Filled contour: mesh triangles colored by scalar field values
 *  2. Mesh wireframe overlay (toggleable)
 *  3. Vector arrows at element centers (toggleable)
 *  4. Color bar gradient on right edge
 *
 * Interactions: pan (middle-mouse/Ctrl+drag), zoom (scroll wheel)
 */

import { useRef, useCallback, useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { useAppSelector } from '@/store/hooks'
import { selectFEMMesh } from '@/store/femDesignSlice'
import {
  selectFEMSolveResult,
  selectFEMSelectedField,
  selectFEMDisplayMode,
} from '@/store/femSolverSlice'
import { mapValueToColor, normalizeValue, rgbToRgba } from './colorMaps'
import type { ColorMapName } from '@/types/femResults'
import type { FEMMesh } from '@/types/femMesh'
import type { ScalarFieldResult, VectorFieldResult } from '@/types/femSolver'

// ── Drawing helpers (pure functions, exported for testing) ────

export function drawFilledContour(
  ctx: CanvasRenderingContext2D,
  mesh: FEMMesh,
  field: ScalarFieldResult,
  colorMap: ColorMapName,
  offset: { x: number; y: number },
  zoom: number,
  w: number,
  h: number,
  colorRange?: [number, number] | null,
) {
  const fMin = colorRange ? colorRange[0] : field.min
  const fMax = colorRange ? colorRange[1] : field.max

  const isElementBased = field.elementValues && field.elementValues.length > 0 && field.values.length === 0

  for (let ei = 0; ei < mesh.elements.length; ei++) {
    const el = mesh.elements[ei]
    const nids = el.nodeIds
    if (!nids || nids.length < 3) continue

    // Get node positions and values for the first 3 nodes (linear triangle)
    const pts: [number, number][] = []

    for (let i = 0; i < 3; i++) {
      const node = mesh.nodes[nids[i]]
      if (!node) continue
      const coords = node.coords
      const [px, py] = worldToCanvas(coords[0], coords[1], offset, zoom, w, h)
      pts.push([px, py])
    }

    if (pts.length < 3) continue

    // Compute average value: node-based or element-based
    let avgVal: number
    if (isElementBased) {
      avgVal = field.elementValues[ei] ?? 0
    } else {
      avgVal =
        (field.values[nids[0]] + field.values[nids[1]] + field.values[nids[2]]) / 3
    }
    const avgT = normalizeValue(avgVal, fMin, fMax)
    const avgRgb = mapValueToColor(avgT, colorMap)

    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    ctx.lineTo(pts[1][0], pts[1][1])
    ctx.lineTo(pts[2][0], pts[2][1])
    ctx.closePath()
    ctx.fillStyle = rgbToRgba(avgRgb)
    ctx.fill()
  }
}

export function drawMeshWireframe(
  ctx: CanvasRenderingContext2D,
  mesh: FEMMesh,
  offset: { x: number; y: number },
  zoom: number,
  w: number,
  h: number,
) {
  ctx.strokeStyle = 'rgba(60, 60, 60, 0.3)'
  ctx.lineWidth = 0.5

  for (const el of mesh.elements) {
    const nids = el.nodeIds
    if (!nids || nids.length < 3) continue

    ctx.beginPath()
    for (let i = 0; i <= Math.min(nids.length, 3); i++) {
      const node = mesh.nodes[nids[i % 3]]
      if (!node) continue
      const coords = node.coords
      const [px, py] = worldToCanvas(coords[0], coords[1], offset, zoom, w, h)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
  }
}

export function drawVectorArrows(
  ctx: CanvasRenderingContext2D,
  mesh: FEMMesh,
  vectorField: VectorFieldResult,
  offset: { x: number; y: number },
  zoom: number,
  w: number,
  h: number,
  scale: number,
) {
  if (!vectorField.values || vectorField.values.length === 0) return
  const maxMag = vectorField.maxMagnitude || 1

  // Draw arrows at element centers (max ~500 for readability)
  const step = Math.max(1, Math.floor(mesh.elements.length / 500))

  for (let ei = 0; ei < mesh.elements.length; ei += step) {
    const el = mesh.elements[ei]
    const nids = el.nodeIds
    if (!nids || nids.length < 3) continue

    // Compute element center
    let cx = 0, cy = 0
    let count = 0
    for (let i = 0; i < Math.min(nids.length, 3); i++) {
      const node = mesh.nodes[nids[i]]
      if (!node) continue
      cx += node.coords[0]
      cy += node.coords[1]
      count++
    }
    if (count === 0) continue
    cx /= count
    cy /= count

    // Average vector at element center
    let vx = 0, vy = 0
    for (let i = 0; i < Math.min(nids.length, 3); i++) {
      const v = vectorField.values[nids[i]]
      if (v) {
        vx += v[0]
        vy += v[1]
      }
    }
    vx /= count
    vy /= count

    const mag = Math.sqrt(vx * vx + vy * vy)
    if (mag < maxMag * 1e-6) continue

    // Scale arrow length relative to element size and zoom
    const arrowLen = (mag / maxMag) * 20 * scale
    const nx = vx / mag
    const ny = vy / mag

    const [px, py] = worldToCanvas(cx, cy, offset, zoom, w, h)
    const ex = px + nx * arrowLen
    const ey = py - ny * arrowLen // Canvas Y is inverted

    // Draw shaft
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(ex, ey)
    ctx.stroke()

    // Draw arrowhead
    const headLen = Math.min(6, arrowLen * 0.3)
    const angle = Math.atan2(-(ey - py), ex - px)
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(
      ex - headLen * Math.cos(angle - Math.PI / 6),
      ey + headLen * Math.sin(angle - Math.PI / 6),
    )
    ctx.moveTo(ex, ey)
    ctx.lineTo(
      ex - headLen * Math.cos(angle + Math.PI / 6),
      ey + headLen * Math.sin(angle + Math.PI / 6),
    )
    ctx.stroke()
  }
}

export function drawColorBar(
  ctx: CanvasRenderingContext2D,
  colorMap: ColorMapName,
  min: number,
  max: number,
  unit: string,
  w: number,
  h: number,
) {
  const barWidth = 20
  const barHeight = Math.min(h - 80, 200)
  const barX = w - barWidth - 40
  const barY = 40

  // Draw gradient bar
  for (let i = 0; i < barHeight; i++) {
    const t = 1 - i / barHeight // Top = max
    const rgb = mapValueToColor(t, colorMap)
    ctx.fillStyle = rgbToRgba(rgb)
    ctx.fillRect(barX, barY + i, barWidth, 1)
  }

  // Border
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1
  ctx.strokeRect(barX, barY, barWidth, barHeight)

  // Labels
  ctx.fillStyle = '#333'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(max.toExponential(2), barX + barWidth + 4, barY + 10)
  ctx.fillText(((max + min) / 2).toExponential(2), barX + barWidth + 4, barY + barHeight / 2 + 4)
  ctx.fillText(min.toExponential(2), barX + barWidth + 4, barY + barHeight)
  if (unit) {
    ctx.fillText(`[${unit}]`, barX + barWidth + 4, barY + barHeight + 14)
  }
}

// Canvas coordinate transforms (same as GeometryCanvas canvasUtils)
function worldToCanvas(
  wx: number,
  wy: number,
  offset: { x: number; y: number },
  zoom: number,
  w: number,
  h: number,
): [number, number] {
  const px = (wx - offset.x) * zoom + w / 2
  const py = -(wy - offset.y) * zoom + h / 2
  return [px, py]
}

// ── Component ─────────────────────────────────────────────────

function FEMResultsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(100)
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  const mesh = useAppSelector(selectFEMMesh)
  const result = useAppSelector(selectFEMSolveResult)
  const selectedField = useAppSelector(selectFEMSelectedField)
  const displayMode = useAppSelector(selectFEMDisplayMode)
  const colorMap = useAppSelector((s) => s.femSolver.colorMap)
  const colorRange = useAppSelector((s) => s.femSolver.colorRange)
  const showMeshOverlay = useAppSelector((s) => s.femSolver.showMeshOverlay)
  const showVectors = useAppSelector((s) => s.femSolver.showVectors)
  const vectorScale = useAppSelector((s) => s.femSolver.vectorScale)

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setCanvasSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Auto-fit to mesh bounds on first load
  useEffect(() => {
    if (!mesh || mesh.nodes.length === 0) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const node of mesh.nodes) {
      const [x, y] = node.coords
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const spanX = maxX - minX || 1
    const spanY = maxY - minY || 1
    const fitZoom = Math.min(canvasSize.w / spanX, canvasSize.h / spanY) * 0.8
    setOffset({ x: cx, y: cy })
    setZoom(fitZoom)
  }, [mesh, canvasSize.w, canvasSize.h])

  // Main render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = canvasSize
    canvas.width = w
    canvas.height = h

    // Clear
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, w, h)

    if (!mesh || !result || !selectedField) {
      ctx.fillStyle = '#999'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('No results to display', w / 2, h / 2)
      return
    }

    // Find scalar field
    const scalarField = result.scalarFields.find((f) => f.name === selectedField)

    // Draw contour fill
    if (scalarField && (displayMode === 'contour' || displayMode === 'both')) {
      drawFilledContour(ctx, mesh, scalarField, colorMap, offset, zoom, w, h, colorRange)
    }

    // Draw mesh wireframe
    if (showMeshOverlay) {
      drawMeshWireframe(ctx, mesh, offset, zoom, w, h)
    }

    // Draw vector arrows
    if (showVectors) {
      const vectorField = result.vectorFields.find(
        (f) => f.name === selectedField || f.name === selectedField.replace('potential', 'e_field'),
      )
      if (vectorField) {
        drawVectorArrows(ctx, mesh, vectorField, offset, zoom, w, h, vectorScale)
      }
    }

    // Draw color bar
    if (scalarField) {
      const fMin = colorRange ? colorRange[0] : scalarField.min
      const fMax = colorRange ? colorRange[1] : scalarField.max
      drawColorBar(ctx, colorMap, fMin, fMax, scalarField.unit, w, h)
    }
  }, [mesh, result, selectedField, displayMode, colorMap, colorRange, showMeshOverlay, showVectors, vectorScale, offset, zoom, canvasSize])

  // Pan/zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(1, Math.min(100000, z * factor)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    }
  }, [offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return
    const dx = (e.clientX - panStart.current.x) / zoom
    const dy = (e.clientY - panStart.current.y) / zoom
    setOffset({ x: panStart.current.ox - dx, y: panStart.current.oy + dy })
  }, [zoom])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
  }, [])

  return (
    <Box ref={containerRef} sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </Box>
  )
}

export default FEMResultsCanvas
