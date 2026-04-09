/**
 * FEM geometry types — mirrors backend FEMGeometry models.
 */

// ── Geometry primitives ───────────────────────────────────────

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

export interface GeoPointDef {
  id: string
  x: string | number
  y: string | number
}

export interface GeoEdgeDef {
  id: string
  edgeType: 'line' | 'arc'
  pointIds: string[]
}

export interface GeoBodyDef {
  id: string
  name: string
  edgeIds: string[]
  innerLoops: string[][]
}

/** Evaluated geometry state — after expression evaluation. */
export interface EvaluatedGeometry {
  points: GeoPointDef[]
  edges: GeoEdgeDef[]
  bodies: GeoBodyDef[]
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
