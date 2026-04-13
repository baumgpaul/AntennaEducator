/**
 * FEM geometry types — surfaces with child edges, bi-directional auto-detection.
 *
 * Entity model:
 *   Surface (closed region) → Edge[] (boundary segments)
 *   Primitives auto-create edges (rect → 4 line edges, circle → 1 arc edge, etc.)
 *   Closed edge loops auto-detect enclosing surface.
 *   Booleans merge/split surfaces and adjust edges accordingly.
 */

// ── Geometry operations (parametric history) ──────────────────

export interface GeoOperation {
  type: GeoOperationType
  params: Record<string, unknown>
}

export type GeoOperationType =
  | 'add_point'
  | 'add_line'
  | 'add_arc'
  | 'add_surface'
  | 'add_rectangle'
  | 'add_circle'
  | 'add_ellipse'
  | 'add_polygon'
  | 'boolean_union'
  | 'boolean_subtract'
  | 'boolean_intersect'
  | 'boolean_fragment'

// ── Points ────────────────────────────────────────────────────

export interface GeoPointDef {
  id: string
  x: string | number
  y: string | number
}

// ── Edges (boundary segments of surfaces) ─────────────────────

export type EdgeType = 'line' | 'arc'

export interface GeoEdgeDef {
  id: string
  edgeType: EdgeType
  pointIds: string[]
  /** Parent surface that owns this edge (null for standalone edges). */
  parentSurfaceId: string | null
  /** Human-readable auto-descriptive name (e.g., "rect1_left"). User can rename. */
  name: string
}

// ── Surfaces (closed regions) ─────────────────────────────────

export interface GeoSurfaceDef {
  id: string
  /** Human-readable name (e.g., "Rectangle_1"). User can rename. */
  name: string
  /** Ordered edge IDs forming the outer boundary (CCW). */
  edgeIds: string[]
  /** Inner boundary loops (holes) — each is an ordered list of edge IDs. */
  innerLoops: string[][]
  /** Source primitive type for auto-naming context. */
  primitiveType: PrimitiveType | 'boolean_result' | 'freeform'
}

export type PrimitiveType = 'rectangle' | 'circle' | 'ellipse' | 'polygon'

// ── Legacy alias for backend compat ───────────────────────────

export type GeoBodyDef = GeoSurfaceDef

// ── Evaluated geometry state ──────────────────────────────────

/** Geometry state after replaying operation history with current variable values. */
export interface EvaluatedGeometry {
  points: GeoPointDef[]
  edges: GeoEdgeDef[]
  surfaces: GeoSurfaceDef[]
  /** Legacy alias */
  bodies: GeoSurfaceDef[]
}

// ── Drawing tools ─────────────────────────────────────────────

export type ToolType =
  | 'select'
  | 'point'
  | 'line'
  | 'arc'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'polygon'

export interface ToolState {
  /** Points collected so far (e.g., first click of a line). */
  pendingPoints: [number, number][]
  /** Preview coordinate (mouse position, snapped). */
  previewPoint: [number, number] | null
}

export const initialToolState: ToolState = {
  pendingPoints: [],
  previewPoint: null,
}

// ── Auto-naming helpers ───────────────────────────────────────

/** Counter state for generating unique auto-descriptive names. */
export interface NamingCounters {
  rectangle: number
  circle: number
  ellipse: number
  polygon: number
  line: number
  arc: number
  point: number
  surface: number
}

export const initialNamingCounters: NamingCounters = {
  rectangle: 0,
  circle: 0,
  ellipse: 0,
  polygon: 0,
  line: 0,
  arc: 0,
  point: 0,
  surface: 0,
}

/** Generate edge names for a rectangle primitive. */
export function rectangleEdgeNames(surfaceName: string): string[] {
  return [`${surfaceName}_bottom`, `${surfaceName}_right`, `${surfaceName}_top`, `${surfaceName}_left`]
}

/** Generate edge name for a circle primitive (single arc edge). */
export function circleEdgeName(surfaceName: string): string {
  return `${surfaceName}_arc`
}

/** Generate edge names for an ellipse primitive (single arc edge). */
export function ellipseEdgeName(surfaceName: string): string {
  return `${surfaceName}_arc`
}

/** Generate edge names for a polygon primitive. */
export function polygonEdgeNames(surfaceName: string, nEdges: number): string[] {
  return Array.from({ length: nEdges }, (_, i) => `${surfaceName}_edge${i + 1}`)
}
