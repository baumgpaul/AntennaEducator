/**
 * GeometryCanvas — 2D orthographic Three.js canvas for FEM geometry.
 *
 * Layers:
 *  1. Grid (background)
 *  2. Surface fills (semi-transparent regions)
 *  3. Edge strokes (lines/arcs)
 *  4. Mesh wireframe (when mesh is ready)
 *  5. Tool preview (rubber-band line / ghost shape)
 *  6. Selection highlight
 *  7. Points
 *
 * Pan:  middle-mouse or Shift+left-drag
 * Zoom: scroll wheel (centered on cursor)
 * Click: tool action or selection
 */

import { useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrthographicCamera, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import {
  selectFEMGeometryOps,
  selectFEMMesh,
  selectFEMMeshStatus,
  selectFEMActiveTool,
  selectFEMSelectedEntity,
  selectFEMEvaluatedGeometry,
  addGeometryOperation,
  addPendingPoint,
  setPreviewPoint,
  resetToolState,
  selectEntity,
  incrementNamingCounter,
} from '@/store/femDesignSlice'
import type { FEMTab } from './FEMDesignPage'
import type { GeoOperation, ToolType, ToolState } from '@/types/femGeometry'
import type { NamingCounters } from '@/types/femGeometry'
import type { FEMMesh } from '@/types/femMesh'

// ── Colors ────────────────────────────────────────────────────
const BODY_FILL_COLOR = new THREE.Color(0x42a5f5)
const BODY_FILL_OPACITY = 0.15
const BODY_STROKE_COLOR = '#1e88e5'
const EDGE_COLOR = '#333333'
const MESH_WIRE_COLOR = '#999999'
const SELECTION_COLOR = '#ff9800'
const PREVIEW_COLOR = '#42a5f5'
const POINT_COLOR = '#333333'
const GRID_COLOR = '#e0e0e0'
const AXIS_COLOR = '#bdbdbd'



interface GeometryCanvasProps {
  currentTab: FEMTab
}

// ── Grid component ────────────────────────────────────────────

function GridLines() {
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null)

  // Rebuild grid lines each frame based on camera zoom
  useFrame(() => {
    if (!groupRef.current) return
    const cam = camera as THREE.OrthographicCamera
    const zoom = cam.zoom
    const cx = cam.position.x
    const cy = cam.position.y

    // Calculate visible range
    const halfW = (cam.right - cam.left) / (2 * zoom)
    const halfH = (cam.top - cam.bottom) / (2 * zoom)
    const left = cx - halfW
    const right = cx + halfW
    const bottom = cy - halfH
    const top = cy + halfH

    // Dynamic grid spacing
    const rawSpacing = (right - left) / 20
    const pow = Math.pow(10, Math.floor(Math.log10(rawSpacing)))
    const norms = [1, 2, 5, 10]
    let spacing = pow
    for (const n of norms) {
      if (n * pow >= rawSpacing) {
        spacing = n * pow
        break
      }
    }

    // Clear existing children
    while (groupRef.current.children.length > 0) {
      const child = groupRef.current.children[0]
      groupRef.current.remove(child)
      if (child instanceof THREE.Line) {
        child.geometry.dispose()
      }
    }

    const gridMaterial = new THREE.LineBasicMaterial({ color: GRID_COLOR })
    const axisMaterial = new THREE.LineBasicMaterial({ color: AXIS_COLOR })

    // Vertical grid lines
    const startX = Math.floor(left / spacing) * spacing
    for (let x = startX; x <= right; x += spacing) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, bottom, -1),
        new THREE.Vector3(x, top, -1),
      ])
      const isAxis = Math.abs(x) < spacing * 0.01
      groupRef.current.add(new THREE.Line(geo, isAxis ? axisMaterial : gridMaterial))
    }

    // Horizontal grid lines
    const startY = Math.floor(bottom / spacing) * spacing
    for (let y = startY; y <= top; y += spacing) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(left, y, -1),
        new THREE.Vector3(right, y, -1),
      ])
      const isAxis = Math.abs(y) < spacing * 0.01
      groupRef.current.add(new THREE.Line(geo, isAxis ? axisMaterial : gridMaterial))
    }
  })

  return <group ref={groupRef} />
}

// ── Geometry rendering from operations ────────────────────────

/** Generate outline points for a geometry operation. */
function getOpOutlinePoints(op: GeoOperation): [number, number][] {
  const p = op.params as Record<string, number | string>
  if (op.type === 'add_rectangle') {
    const rw = Number(p.width ?? 1)
    const rh = Number(p.height ?? 1)
    const cx = p.center_x !== undefined ? Number(p.center_x) : Number(p.x ?? 0) + rw / 2
    const cy = p.center_y !== undefined ? Number(p.center_y) : Number(p.y ?? 0) + rh / 2
    return [
      [cx - rw / 2, cy - rh / 2],
      [cx + rw / 2, cy - rh / 2],
      [cx + rw / 2, cy + rh / 2],
      [cx - rw / 2, cy + rh / 2],
      [cx - rw / 2, cy - rh / 2],
    ]
  }
  if (op.type === 'add_circle') {
    const cx = p.center_x !== undefined ? Number(p.center_x) : Number(p.cx ?? 0)
    const cy = p.center_y !== undefined ? Number(p.center_y) : Number(p.cy ?? 0)
    const r = Number(p.radius ?? 1)
    const pts: [number, number][] = []
    const N = 64
    for (let i = 0; i <= N; i++) {
      const a = (2 * Math.PI * i) / N
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    return pts
  }
  if (op.type === 'add_ellipse') {
    const cx = p.center_x !== undefined ? Number(p.center_x) : Number(p.cx ?? 0)
    const cy = p.center_y !== undefined ? Number(p.center_y) : Number(p.cy ?? 0)
    const rx = Number(p.semi_axis_a ?? p.rx ?? 1)
    const ry = Number(p.semi_axis_b ?? p.ry ?? 0.5)
    const pts: [number, number][] = []
    const N = 64
    for (let i = 0; i <= N; i++) {
      const a = (2 * Math.PI * i) / N
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
    }
    return pts
  }
  if (op.type === 'add_polygon') {
    const verts = (p as unknown as { vertices: [number, number][] }).vertices ?? []
    if (verts.length >= 3) return [...verts, verts[0]]
    return verts
  }
  if (op.type === 'add_line') {
    return [
      [Number(p.start_x ?? 0), Number(p.start_y ?? 0)],
      [Number(p.end_x ?? 0), Number(p.end_y ?? 0)],
    ]
  }
  if (op.type === 'add_arc') {
    const sx = Number(p.start_x ?? 0)
    const sy = Number(p.start_y ?? 0)
    const acx = Number(p.center_x ?? 0)
    const acy = Number(p.center_y ?? 0)
    const ex = Number(p.end_x ?? 0)
    const ey = Number(p.end_y ?? 0)
    const r = Math.hypot(sx - acx, sy - acy)
    if (r < 1e-10) return [[sx, sy]]
    const sa = Math.atan2(sy - acy, sx - acx)
    let dAngle = Math.atan2(ey - acy, ex - acx) - sa
    if (dAngle > Math.PI) dAngle -= 2 * Math.PI
    if (dAngle < -Math.PI) dAngle += 2 * Math.PI
    const pts: [number, number][] = []
    const N = 32
    for (let i = 0; i <= N; i++) {
      const angle = sa + dAngle * (i / N)
      pts.push([acx + r * Math.cos(angle), acy + r * Math.sin(angle)])
    }
    return pts
  }
  return []
}

/** Check if an operation creates a closed shape (surface). */
function isClosedShape(op: GeoOperation): boolean {
  return (
    op.type === 'add_rectangle' ||
    op.type === 'add_circle' ||
    op.type === 'add_ellipse' ||
    op.type === 'add_polygon'
  )
}

/** Render a single geometry operation as Three.js objects. */
function GeoOpMesh({
  op,
  isSelected,
}: {
  op: GeoOperation
  isSelected: boolean
}) {
  const outline = useMemo(() => getOpOutlinePoints(op), [op])
  const points = useMemo(
    () => outline.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    [outline],
  )

  const fillGeometry = useMemo(() => {
    if (!isClosedShape(op) || outline.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(outline[0][0], outline[0][1])
    for (let i = 1; i < outline.length; i++) {
      shape.lineTo(outline[i][0], outline[i][1])
    }
    return new THREE.ShapeGeometry(shape)
  }, [op, outline])

  const strokeColor = isSelected ? SELECTION_COLOR : isClosedShape(op) ? BODY_STROKE_COLOR : EDGE_COLOR
  const lineWidth = isSelected ? 3 : 2

  // Point rendering
  if (op.type === 'add_point') {
    const p = op.params as Record<string, number>
    const x = Number(p.x ?? 0)
    const y = Number(p.y ?? 0)
    return (
      <mesh position={[x, y, 0.1]}>
        <circleGeometry args={[0.04, 16]} />
        <meshBasicMaterial color={isSelected ? SELECTION_COLOR : POINT_COLOR} />
      </mesh>
    )
  }

  return (
    <group>
      {/* Fill */}
      {fillGeometry && (
        <mesh geometry={fillGeometry} position={[0, 0, 0]}>
          <meshBasicMaterial
            color={BODY_FILL_COLOR}
            transparent
            opacity={BODY_FILL_OPACITY}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* Stroke */}
      {points.length >= 2 && (
        <Line
          points={points}
          color={strokeColor}
          lineWidth={lineWidth}
          position={[0, 0, 0.05]}
        />
      )}
    </group>
  )
}

// ── Boolean result preview ────────────────────────────────────

const BOOL_RESULT_COLOR = '#7e57c2'
const BOOL_TOOL_COLOR = '#ef5350'

/** Render a visual preview for a boolean operation.
 *  Shows the object outline as filled and the tool outline as dashed.
 */
function BooleanPreview({
  op,
  allOps,
  isSelected,
}: {
  op: GeoOperation
  allOps: GeoOperation[]
  isSelected: boolean
}) {
  const p = op.params as Record<string, unknown>
  const objTag = String(p.object_tag ?? p.object ?? '')
  const toolTag = String(p.tool_tag ?? p.tool ?? '')

  // Find the original operations to get their outlines
  const objOp = allOps.find(
    (o) => String((o.params as Record<string, unknown>).tag) === objTag,
  )
  const toolOp = allOps.find(
    (o) => String((o.params as Record<string, unknown>).tag) === toolTag,
  )

  const objOutline = useMemo(() => (objOp ? getOpOutlinePoints(objOp) : []), [objOp])
  const toolOutline = useMemo(() => (toolOp ? getOpOutlinePoints(toolOp) : []), [toolOp])

  const objPts = useMemo(
    () => objOutline.map(([x, y]) => new THREE.Vector3(x, y, 0.06)),
    [objOutline],
  )
  const toolPts = useMemo(
    () => toolOutline.map(([x, y]) => new THREE.Vector3(x, y, 0.07)),
    [toolOutline],
  )

  // Fill for the object (base shape)
  const objFill = useMemo(() => {
    if (objOutline.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(objOutline[0][0], objOutline[0][1])
    for (let i = 1; i < objOutline.length; i++) {
      shape.lineTo(objOutline[i][0], objOutline[i][1])
    }
    return new THREE.ShapeGeometry(shape)
  }, [objOutline])

  const strokeColor = isSelected ? SELECTION_COLOR : BOOL_RESULT_COLOR

  return (
    <group>
      {/* Object fill */}
      {objFill && (
        <mesh geometry={objFill} position={[0, 0, 0]}>
          <meshBasicMaterial
            color={new THREE.Color(BOOL_RESULT_COLOR)}
            transparent
            opacity={0.12}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* Object outline — solid */}
      {objPts.length >= 2 && (
        <Line points={objPts} color={strokeColor} lineWidth={2} />
      )}
      {/* Tool outline — dashed red to show cut/merge region */}
      {toolPts.length >= 2 && (
        <Line
          points={toolPts}
          color={BOOL_TOOL_COLOR}
          lineWidth={1.5}
          dashed
          dashSize={0.06}
          gapSize={0.04}
        />
      )}
    </group>
  )
}

// ── Mesh wireframe ────────────────────────────────────────────

function MeshWireframe({ mesh }: { mesh: FEMMesh }) {
  const lineSegments = useMemo(() => {
    const positions: number[] = []

    for (const elem of mesh.elements) {
      const corners = elem.elementType === 'tri6' ? 3 : elem.nodeIds.length
      for (let i = 0; i < corners; i++) {
        const n1 = mesh.nodes.find((n) => n.id === elem.nodeIds[i])
        const n2 = mesh.nodes.find((n) => n.id === elem.nodeIds[(i + 1) % corners])
        if (!n1 || !n2) continue
        positions.push(n1.coords[0], n1.coords[1], 0.02)
        positions.push(n2.coords[0], n2.coords[1], 0.02)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [mesh])

  return (
    <lineSegments geometry={lineSegments}>
      <lineBasicMaterial color={MESH_WIRE_COLOR} transparent opacity={0.4} />
    </lineSegments>
  )
}

// ── Tool preview ──────────────────────────────────────────────

function ToolPreview({ tool, toolState }: { tool: ToolType; toolState: ToolState }) {
  if (tool === 'select' || !toolState.previewPoint) return null

  const [mx, my] = toolState.previewPoint

  // Line preview
  if (tool === 'line' && toolState.pendingPoints.length === 1) {
    const [sx, sy] = toolState.pendingPoints[0]
    return (
      <Line
        points={[new THREE.Vector3(sx, sy, 0.1), new THREE.Vector3(mx, my, 0.1)]}
        color={PREVIEW_COLOR}
        lineWidth={1.5}
        dashed
        dashSize={0.05}
        gapSize={0.03}
      />
    )
  }

  // Rectangle preview
  if (tool === 'rectangle' && toolState.pendingPoints.length === 1) {
    const [sx, sy] = toolState.pendingPoints[0]
    const pts = [
      new THREE.Vector3(sx, sy, 0.1),
      new THREE.Vector3(mx, sy, 0.1),
      new THREE.Vector3(mx, my, 0.1),
      new THREE.Vector3(sx, my, 0.1),
      new THREE.Vector3(sx, sy, 0.1),
    ]
    return <Line points={pts} color={PREVIEW_COLOR} lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />
  }

  // Circle preview
  if (tool === 'circle' && toolState.pendingPoints.length === 1) {
    const [cx, cy] = toolState.pendingPoints[0]
    const r = Math.hypot(mx - cx, my - cy)
    if (r < 1e-10) return null
    const pts: THREE.Vector3[] = []
    const N = 64
    for (let i = 0; i <= N; i++) {
      const a = (2 * Math.PI * i) / N
      pts.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.1))
    }
    return <Line points={pts} color={PREVIEW_COLOR} lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />
  }

  // Ellipse preview
  if (tool === 'ellipse' && toolState.pendingPoints.length === 1) {
    const [cx, cy] = toolState.pendingPoints[0]
    const rx = Math.abs(mx - cx)
    const ry = Math.abs(my - cy)
    if (rx < 1e-10 || ry < 1e-10) return null
    const pts: THREE.Vector3[] = []
    const N = 64
    for (let i = 0; i <= N; i++) {
      const a = (2 * Math.PI * i) / N
      pts.push(new THREE.Vector3(cx + rx * Math.cos(a), cy + ry * Math.sin(a), 0.1))
    }
    return <Line points={pts} color={PREVIEW_COLOR} lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />
  }

  // Arc preview
  if (tool === 'arc') {
    if (toolState.pendingPoints.length === 1) {
      const [sx, sy] = toolState.pendingPoints[0]
      return (
        <Line
          points={[new THREE.Vector3(sx, sy, 0.1), new THREE.Vector3(mx, my, 0.1)]}
          color={PREVIEW_COLOR}
          lineWidth={1.5}
          dashed
          dashSize={0.05}
          gapSize={0.03}
        />
      )
    }
    if (toolState.pendingPoints.length === 2) {
      const [sx, sy] = toolState.pendingPoints[0]
      const [acx, acy] = toolState.pendingPoints[1]
      const r = Math.hypot(sx - acx, sy - acy)
      if (r < 1e-10) return null
      const sa = Math.atan2(sy - acy, sx - acx)
      let dAngle = Math.atan2(my - acy, mx - acx) - sa
      if (dAngle > Math.PI) dAngle -= 2 * Math.PI
      if (dAngle < -Math.PI) dAngle += 2 * Math.PI
      const pts: THREE.Vector3[] = []
      const N = 32
      for (let i = 0; i <= N; i++) {
        const angle = sa + dAngle * (i / N)
        pts.push(new THREE.Vector3(acx + r * Math.cos(angle), acy + r * Math.sin(angle), 0.1))
      }
      return (
        <group>
          <Line points={pts} color={PREVIEW_COLOR} lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />
          <mesh position={[acx, acy, 0.1]}>
            <circleGeometry args={[0.03, 12]} />
            <meshBasicMaterial color={PREVIEW_COLOR} />
          </mesh>
        </group>
      )
    }
  }

  // Polygon preview
  if (tool === 'polygon' && toolState.pendingPoints.length > 0) {
    const pts = toolState.pendingPoints.map(([x, y]) => new THREE.Vector3(x, y, 0.1))
    pts.push(new THREE.Vector3(mx, my, 0.1))
    if (toolState.pendingPoints.length >= 2) {
      pts.push(new THREE.Vector3(toolState.pendingPoints[0][0], toolState.pendingPoints[0][1], 0.1))
    }
    return <Line points={pts} color={PREVIEW_COLOR} lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />
  }

  // Pending point dots
  if (toolState.pendingPoints.length > 0) {
    return (
      <group>
        {toolState.pendingPoints.map(([px, py], i) => (
          <mesh key={i} position={[px, py, 0.11]}>
            <circleGeometry args={[0.03, 12]} />
            <meshBasicMaterial color={PREVIEW_COLOR} />
          </mesh>
        ))}
      </group>
    )
  }

  return null
}

// ── Camera controls (pan/zoom) ────────────────────────────────

function CameraControls({ activeTool }: { activeTool: ToolType }) {
  const { camera, gl } = useThree()
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 })

  useEffect(() => {
    const canvas = gl.domElement

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = camera as THREE.OrthographicCamera
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      cam.zoom = Math.max(0.5, Math.min(500, cam.zoom * factor))
      cam.updateProjectionMatrix()
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanning.current = true
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          camX: camera.position.x,
          camY: camera.position.y,
        }
        e.preventDefault()
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return
      const cam = camera as THREE.OrthographicCamera
      const rect = canvas.getBoundingClientRect()
      const pixelW = rect.width
      const worldW = (cam.right - cam.left) / cam.zoom
      const scale = worldW / pixelW

      camera.position.x = panStart.current.camX - (e.clientX - panStart.current.x) * scale
      camera.position.y = panStart.current.camY + (e.clientY - panStart.current.y) * scale
      camera.updateProjectionMatrix()
    }

    const handleMouseUp = () => {
      isPanning.current = false
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [camera, gl, activeTool])

  return null
}

// ── Click handler ─────────────────────────────────────────────

function ClickHandler({
  activeTool,
  toolState,
  geometryOps,
  namingCounters,
}: {
  activeTool: ToolType
  toolState: ToolState
  geometryOps: GeoOperation[]
  namingCounters: NamingCounters
}) {
  const dispatch = useAppDispatch()
  const { camera, gl, size } = useThree()

  // Stable refs for event handlers
  const activeToolRef = useRef(activeTool)
  const toolStateRef = useRef(toolState)
  const geometryOpsRef = useRef(geometryOps)
  const namingCountersRef = useRef(namingCounters)
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])
  useEffect(() => { toolStateRef.current = toolState }, [toolState])
  useEffect(() => { geometryOpsRef.current = geometryOps }, [geometryOps])
  useEffect(() => { namingCountersRef.current = namingCounters }, [namingCounters])

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = gl.domElement.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width) * 2 - 1
      const y = -((clientY - rect.top) / rect.height) * 2 + 1
      const vec = new THREE.Vector3(x, y, 0).unproject(camera)
      return [vec.x, vec.y]
    },
    [camera, gl],
  )

  // Hit test against geometry operations
  const hitTest = useCallback(
    (wx: number, wy: number): { id: string; type: 'point' | 'edge' | 'body' | 'surface' } | null => {
      const cam = camera as THREE.OrthographicCamera
      const worldWidth = (cam.right - cam.left) / cam.zoom
      const threshold = (worldWidth / size.width) * 8

      for (let i = geometryOpsRef.current.length - 1; i >= 0; i--) {
        const op = geometryOpsRef.current[i]
        const tag = String((op.params as Record<string, unknown>).tag ?? '')
        const p = op.params as Record<string, number>

        if (op.type === 'add_point') {
          if (Math.hypot(wx - Number(p.x ?? 0), wy - Number(p.y ?? 0)) < threshold) {
            return { id: tag, type: 'point' }
          }
        } else if (op.type === 'add_rectangle') {
          const cx = p.center_x !== undefined ? Number(p.center_x) : Number(p.x ?? 0) + Number(p.width ?? 0) / 2
          const cy = p.center_y !== undefined ? Number(p.center_y) : Number(p.y ?? 0) + Number(p.height ?? 0) / 2
          const hw = Number(p.width ?? 0) / 2
          const hh = Number(p.height ?? 0) / 2
          if (wx >= cx - hw && wx <= cx + hw && wy >= cy - hh && wy <= cy + hh) {
            return { id: tag, type: 'surface' }
          }
        } else if (op.type === 'add_circle') {
          const cx = p.center_x !== undefined ? Number(p.center_x) : Number(p.cx ?? 0)
          const cy = p.center_y !== undefined ? Number(p.center_y) : Number(p.cy ?? 0)
          if (Math.hypot(wx - cx, wy - cy) <= Number(p.radius ?? 0) + threshold) {
            return { id: tag, type: 'surface' }
          }
        } else if (op.type === 'add_ellipse') {
          const cx = p.center_x !== undefined ? Number(p.center_x) : Number(p.cx ?? 0)
          const cy = p.center_y !== undefined ? Number(p.center_y) : Number(p.cy ?? 0)
          const rx = Number(p.semi_axis_a ?? p.rx ?? 1)
          const ry = Number(p.semi_axis_b ?? p.ry ?? 1)
          const dx = (wx - cx) / (rx + threshold)
          const dy = (wy - cy) / (ry + threshold)
          if (dx * dx + dy * dy <= 1) {
            return { id: tag, type: 'surface' }
          }
        } else if (op.type === 'add_line') {
          const x1 = Number(p.start_x ?? 0), y1 = Number(p.start_y ?? 0)
          const x2 = Number(p.end_x ?? 0), y2 = Number(p.end_y ?? 0)
          const A = x2 - x1, B = y2 - y1
          const len2 = A * A + B * B
          if (len2 < 1e-12) {
            if (Math.hypot(wx - x1, wy - y1) < threshold) return { id: tag, type: 'edge' }
          } else {
            const t = Math.max(0, Math.min(1, ((wx - x1) * A + (wy - y1) * B) / len2))
            if (Math.hypot(wx - (x1 + t * A), wy - (y1 + t * B)) < threshold) {
              return { id: tag, type: 'edge' }
            }
          }
        } else if (op.type === 'add_polygon') {
          const verts = (p as unknown as { vertices: [number, number][] }).vertices ?? []
          if (verts.length >= 3) {
            let inside = false
            for (let vi = 0, vj = verts.length - 1; vi < verts.length; vj = vi++) {
              const xi = verts[vi][0], yi = verts[vi][1]
              const xj = verts[vj][0], yj = verts[vj][1]
              if ((yi > wy) !== (yj > wy) && wx < ((xj - xi) * (wy - yi)) / (yj - yi) + xi) {
                inside = !inside
              }
            }
            if (inside) return { id: tag, type: 'surface' }
          }
        }
      }
      return null
    },
    [camera, size],
  )

  useEffect(() => {
    const canvas = gl.domElement

    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.shiftKey) return

      const [wx, wy] = screenToWorld(e.clientX, e.clientY)
      const tool = activeToolRef.current
      const ts = toolStateRef.current
      const counters = namingCountersRef.current

      if (tool === 'select') {
        const hit = hitTest(wx, wy)
        dispatch(selectEntity(hit ?? { id: null, type: null }))
        return
      }

      if (tool === 'point') {
        dispatch(addGeometryOperation({
          type: 'add_point',
          params: { x: wx, y: wy, tag: `pt_${Date.now()}` },
        }))
        dispatch(incrementNamingCounter('point'))
        return
      }

      if (tool === 'line') {
        if (ts.pendingPoints.length === 0) {
          dispatch(addPendingPoint([wx, wy]))
        } else {
          const [sx, sy] = ts.pendingPoints[0]
          const idx = counters.line ?? 0
          dispatch(addGeometryOperation({
            type: 'add_line',
            params: {
              start_x: sx, start_y: sy, end_x: wx, end_y: wy,
              tag: `line_${idx + 1}`,
            },
          }))
          dispatch(incrementNamingCounter('line'))
          dispatch(resetToolState())
        }
        return
      }

      if (tool === 'rectangle') {
        if (ts.pendingPoints.length === 0) {
          dispatch(addPendingPoint([wx, wy]))
        } else {
          const [sx, sy] = ts.pendingPoints[0]
          const rw = Math.abs(wx - sx)
          const rh = Math.abs(wy - sy)
          if (rw > 1e-10 && rh > 1e-10) {
            const idx = counters.rectangle ?? 0
            dispatch(addGeometryOperation({
              type: 'add_rectangle',
              params: {
                center_x: (sx + wx) / 2,
                center_y: (sy + wy) / 2,
                width: rw,
                height: rh,
                tag: `rect_${idx + 1}`,
              },
            }))
            dispatch(incrementNamingCounter('rectangle'))
          }
          dispatch(resetToolState())
        }
        return
      }

      if (tool === 'circle') {
        if (ts.pendingPoints.length === 0) {
          dispatch(addPendingPoint([wx, wy]))
        } else {
          const [cx, cy] = ts.pendingPoints[0]
          const r = Math.hypot(wx - cx, wy - cy)
          if (r > 1e-10) {
            const idx = counters.circle ?? 0
            dispatch(addGeometryOperation({
              type: 'add_circle',
              params: {
                center_x: cx, center_y: cy, radius: r,
                tag: `circle_${idx + 1}`,
              },
            }))
            dispatch(incrementNamingCounter('circle'))
          }
          dispatch(resetToolState())
        }
        return
      }

      if (tool === 'ellipse') {
        if (ts.pendingPoints.length === 0) {
          dispatch(addPendingPoint([wx, wy]))
        } else {
          const [cx, cy] = ts.pendingPoints[0]
          const semiA = Math.abs(wx - cx)
          const semiB = Math.abs(wy - cy)
          if (semiA > 1e-10 && semiB > 1e-10) {
            const idx = counters.ellipse ?? 0
            dispatch(addGeometryOperation({
              type: 'add_ellipse',
              params: {
                center_x: cx, center_y: cy, semi_axis_a: semiA, semi_axis_b: semiB,
                tag: `ellipse_${idx + 1}`,
              },
            }))
            dispatch(incrementNamingCounter('ellipse'))
          }
          dispatch(resetToolState())
        }
        return
      }

      if (tool === 'arc') {
        if (ts.pendingPoints.length < 2) {
          dispatch(addPendingPoint([wx, wy]))
        } else {
          const [sx, sy] = ts.pendingPoints[0]
          const [acx, acy] = ts.pendingPoints[1]
          const idx = counters.arc ?? 0
          dispatch(addGeometryOperation({
            type: 'add_arc',
            params: {
              start_x: sx, start_y: sy, center_x: acx, center_y: acy,
              end_x: wx, end_y: wy,
              tag: `arc_${idx + 1}`,
            },
          }))
          dispatch(incrementNamingCounter('arc'))
          dispatch(resetToolState())
        }
        return
      }

      if (tool === 'polygon') {
        dispatch(addPendingPoint([wx, wy]))
        return
      }
    }

    const handleDblClick = (e: MouseEvent) => {
      const tool = activeToolRef.current
      const ts = toolStateRef.current
      if (tool !== 'polygon' || ts.pendingPoints.length < 3) return
      e.preventDefault()
      const counters = namingCountersRef.current
      const idx = counters.polygon ?? 0
      dispatch(addGeometryOperation({
        type: 'add_polygon',
        params: { vertices: ts.pendingPoints, tag: `polygon_${idx + 1}` },
      }))
      dispatch(incrementNamingCounter('polygon'))
      dispatch(resetToolState())
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (activeToolRef.current === 'select') return
      const [wx, wy] = screenToWorld(e.clientX, e.clientY)
      dispatch(setPreviewPoint([wx, wy]))
    }

    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('dblclick', handleDblClick)
    canvas.addEventListener('mousemove', handleMouseMove)

    return () => {
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('dblclick', handleDblClick)
      canvas.removeEventListener('mousemove', handleMouseMove)
    }
  }, [gl, dispatch, screenToWorld, hitTest])

  // Keyboard: Escape to cancel, Enter to finalize polygon
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch(resetToolState())
        dispatch(selectEntity({ id: null, type: null }))
      } else if (e.key === 'Enter') {
        const tool = activeToolRef.current
        const ts = toolStateRef.current
        if (tool === 'polygon' && ts.pendingPoints.length >= 3) {
          const counters = namingCountersRef.current
          const idx = counters.polygon ?? 0
          dispatch(addGeometryOperation({
            type: 'add_polygon',
            params: { vertices: ts.pendingPoints, tag: `polygon_${idx + 1}` },
          }))
          dispatch(incrementNamingCounter('polygon'))
          dispatch(resetToolState())
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch])

  return null
}

// ── Entity labels ─────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'Inter, Roboto, sans-serif',
  color: '#333',
  background: 'rgba(255,255,255,0.85)',
  padding: '1px 4px',
  borderRadius: '3px',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  border: '1px solid #ccc',
}

/** Compute centroid of a closed polygon (outline points). */
function computeCentroid(outline: [number, number][]): [number, number] {
  if (outline.length === 0) return [0, 0]
  let sx = 0, sy = 0
  // Skip the closing duplicate point if present
  const n = outline.length > 1 &&
    outline[0][0] === outline[outline.length - 1][0] &&
    outline[0][1] === outline[outline.length - 1][1]
    ? outline.length - 1 : outline.length
  for (let i = 0; i < n; i++) {
    sx += outline[i][0]
    sy += outline[i][1]
  }
  return [sx / n, sy / n]
}

/** Render name labels for each visible geometry entity. */
function EntityLabels({ geometryOps }: { geometryOps: GeoOperation[] }) {
  const evalGeo = useAppSelector(selectFEMEvaluatedGeometry)

  const labels = useMemo(() => {
    // Collect consumed tags (shapes replaced by booleans)
    const consumed = new Set<string>()
    for (const op of geometryOps) {
      if (op.type.startsWith('boolean_')) {
        const p = op.params as Record<string, unknown>
        const objTag = String(p.object_tag ?? p.object ?? '')
        const toolTag = String(p.tool_tag ?? p.tool ?? '')
        const removeTool = p.remove_tool !== false
        if (objTag) consumed.add(objTag)
        if (removeTool && toolTag) consumed.add(toolTag)
      }
    }

    const items: { name: string; pos: [number, number]; key: string }[] = []

    for (const op of geometryOps) {
      const p = op.params as Record<string, unknown>
      const tag = String(p.tag ?? '')
      if (!tag || consumed.has(tag)) continue

      const outline = getOpOutlinePoints(op)
      if (outline.length < 2) {
        // Point label
        if (op.type === 'add_point') {
          const x = Number(p.x ?? 0)
          const y = Number(p.y ?? 0)
          const name = evalGeo?.points.find((pt) => pt.id === tag)?.id ?? tag
          items.push({ name, pos: [x, y], key: tag })
        }
        continue
      }

      const [cx, cy] = computeCentroid(outline)
      // Look up surface name from evaluated geometry
      const surface = evalGeo?.surfaces.find((s) => s.id === tag)
      const name = surface?.name ?? tag
      items.push({ name, pos: [cx, cy], key: tag })
    }

    return items
  }, [geometryOps, evalGeo])

  return (
    <>
      {labels.map((lbl) => (
        <Html
          key={`label_${lbl.key}`}
          position={[lbl.pos[0], lbl.pos[1], 0.2]}
          center
          zIndexRange={[10, 0]}
        >
          <div style={LABEL_STYLE}>{lbl.name}</div>
        </Html>
      ))}
    </>
  )
}

// ── Main Scene ────────────────────────────────────────────────

function FEMScene({ currentTab: _currentTab }: { currentTab: FEMTab }) {
  const geometryOps = useAppSelector(selectFEMGeometryOps)
  const mesh = useAppSelector(selectFEMMesh)
  const meshStatus = useAppSelector(selectFEMMeshStatus)
  const activeTool = useAppSelector(selectFEMActiveTool)
  const selectedEntity = useAppSelector(selectFEMSelectedEntity)
  const toolState = useAppSelector((s) => s.femDesign.toolState)
  const showMeshOverlay = useAppSelector((s) => s.femSolver.showMeshOverlay)
  const namingCounters = useAppSelector((s) => s.femDesign.namingCounters)

  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[0, 0, 10]}
        zoom={100}
        near={0.1}
        far={1000}
      />
      <CameraControls activeTool={activeTool} />
      <ClickHandler
        activeTool={activeTool}
        toolState={toolState}
        geometryOps={geometryOps}
        namingCounters={namingCounters}
      />

      {/* Grid */}
      <GridLines />

      {/* Geometry operations — skip shapes consumed by boolean ops */}
      {(() => {
        // Collect tags consumed (removed) by boolean operations
        const consumed = new Set<string>()
        for (const op of geometryOps) {
          if (op.type.startsWith('boolean_')) {
            const p = op.params as Record<string, unknown>
            const objTag = String(p.object_tag ?? p.object ?? '')
            const toolTag = String(p.tool_tag ?? p.tool ?? '')
            const removeTool = p.remove_tool !== false
            // Object is always replaced by the result
            if (objTag) consumed.add(objTag)
            if (removeTool && toolTag) consumed.add(toolTag)
          }
        }

        return geometryOps.map((op, idx) => {
          const tag = String((op.params as Record<string, unknown>).tag ?? `op_${idx}`)
          // Render boolean ops with BooleanPreview instead of GeoOpMesh
          if (op.type.startsWith('boolean_')) {
            const isSelected = selectedEntity.id === tag
            return (
              <BooleanPreview
                key={`${tag}_${idx}`}
                op={op}
                allOps={geometryOps}
                isSelected={isSelected}
              />
            )
          }
          // Hide primitives that were consumed by a boolean
          if (consumed.has(tag)) return null
          const isSelected = selectedEntity.id === tag
          return <GeoOpMesh key={`${tag}_${idx}`} op={op} isSelected={isSelected} />
        })
      })()}

      {/* Mesh wireframe */}
      {mesh && (meshStatus === 'ready' || meshStatus === 'stale') && showMeshOverlay && (
        <MeshWireframe mesh={mesh} />
      )}

      {/* Tool preview */}
      <ToolPreview tool={activeTool} toolState={toolState} />

      {/* Entity name labels */}
      <EntityLabels geometryOps={geometryOps} />
    </>
  )
}

// ── Zoom reporter (inside Canvas → parent) ───────────────────

function ZoomReporter({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const { camera } = useThree()
  const lastZoom = useRef(0)

  useFrame(() => {
    const cam = camera as THREE.OrthographicCamera
    if (cam.zoom !== lastZoom.current) {
      lastZoom.current = cam.zoom
      onZoomChange(cam.zoom)
    }
  })

  return null
}

// ── Scale bar helper ──────────────────────────────────────────

function formatScaleLabel(value: number): string {
  if (value >= 1) return `${value} m`
  if (value >= 0.01) return `${(value * 100).toPrecision(3)} cm`
  if (value >= 0.001) return `${(value * 1000).toPrecision(3)} mm`
  return `${value.toExponential(1)} m`
}

// ── Main component ────────────────────────────────────────────

function GeometryCanvas({ currentTab }: GeometryCanvasProps) {
  const geometryOps = useAppSelector(selectFEMGeometryOps)
  const activeTool = useAppSelector(selectFEMActiveTool)
  const [zoom, setZoom] = useState(100)

  // Compute scale bar dimensions based on zoom level
  const scaleBar = useMemo(() => {
    // Target: bar should be ~120px on screen
    const targetPx = 120
    // World units per pixel: with default Ortho cam (left=-w/2, right=w/2), zoom factor
    // The camera has left/right at about ±3.5 (viewport based), zoom controls scaling
    // In the default setup, 1 world unit = zoom pixels on screen
    const worldPerPx = 1 / zoom
    const targetWorld = worldPerPx * targetPx

    // Snap to a nice value
    const pow = Math.pow(10, Math.floor(Math.log10(targetWorld)))
    const norms = [1, 2, 5, 10]
    let niceWorld = pow
    for (const n of norms) {
      if (n * pow >= targetWorld) {
        niceWorld = n * pow
        break
      }
    }

    const barPx = niceWorld * zoom
    return { widthPx: barPx, worldValue: niceWorld }
  }, [zoom])

  const handleZoomChange = useCallback((z: number) => setZoom(z), [])

  return (
    <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <Canvas
        gl={{ antialias: true, alpha: false }}
        style={{
          width: '100%',
          height: '100%',
          cursor: activeTool === 'select' ? 'default' : 'crosshair',
          background: '#fafafa',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <FEMScene currentTab={currentTab} />
        <ZoomReporter onZoomChange={handleZoomChange} />
      </Canvas>

      {/* Scale bar */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 12,
          left: 16,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0.25,
        }}
      >
        <Box
          sx={{
            width: scaleBar.widthPx,
            height: 6,
            borderLeft: '2px solid #555',
            borderRight: '2px solid #555',
            borderBottom: '2px solid #555',
          }}
        />
        <Typography
          variant="caption"
          sx={{ fontSize: 10, color: '#555', lineHeight: 1, userSelect: 'none' }}
        >
          {formatScaleLabel(scaleBar.worldValue)}
        </Typography>
      </Box>

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
