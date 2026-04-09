/**
 * FEM mesh types — mirrors backend FEMMesh models.
 */

export type ElementType = 'tri3' | 'tri6' | 'quad4'

export interface FEMNode {
  id: number
  coords: [number, number]
}

export interface FEMElement {
  id: number
  elementType: ElementType
  nodeIds: number[]
  regionId: number
}

export interface Region {
  id: number
  name: string
  materialId: string | null
}

export interface BoundaryEdge {
  id: number
  nodeIds: [number, number]
  regionName: string
}

export interface FEMMesh {
  nodes: FEMNode[]
  elements: FEMElement[]
  regions: Region[]
  boundaryEdges: BoundaryEdge[]
  elementType: ElementType
  dimension: number
  metadata: Record<string, unknown>
}

export interface MeshStatistics {
  nNodes: number
  nElements: number
  nRegions: number
  nBoundaryEdges: number
  minElementQuality: number
  avgElementQuality: number
}

export type MeshStatus = 'none' | 'generating' | 'ready' | 'stale'
