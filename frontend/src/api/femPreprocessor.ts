/**
 * FEM Preprocessor API — mesh generation and import.
 */

import { femPreprocessorClient, handleApiResponse } from './client'
import type { GeoOperation } from '@/types/femGeometry'
import type { FEMMesh } from '@/types/femMesh'
import type { FEMDiscretizationSettings } from '@/store/femDesignSlice'

export interface MeshGenerateRequest {
  geometry: {
    operations: GeoOperation[]
  }
  discretization: {
    element_type: string
    global_element_size: number | string
    min_element_size: number | string
    growth_rate: number
    algorithm: string
    optimize: boolean
    recombine_to_quads: boolean
    body_sizes: Record<string, number>
    edge_divisions: Record<string, number>
  }
  variables?: Record<string, number>
}

/** Convert frontend discretization settings to backend snake_case format. */
function toBackendDiscretization(
  settings: FEMDiscretizationSettings
): MeshGenerateRequest['discretization'] {
  return {
    element_type: settings.elementType,
    global_element_size: settings.globalElementSize,
    min_element_size: settings.minElementSize,
    growth_rate: settings.growthRate,
    algorithm: settings.algorithm,
    optimize: settings.optimize,
    recombine_to_quads: settings.recombineToQuads,
    body_sizes: settings.bodySizes,
    edge_divisions: settings.edgeDivisions,
  }
}

/** Convert backend snake_case mesh JSON to frontend camelCase FEMMesh. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFEMMesh(raw: any): FEMMesh {
  return {
    nodes: raw.nodes,
    elements: (raw.elements ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      elementType: e.element_type ?? e.elementType,
      nodeIds: e.node_ids ?? e.nodeIds,
      regionId: e.region_id ?? e.regionId,
    })),
    regions: (raw.regions ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      materialId: r.material_id ?? r.materialId ?? null,
    })),
    boundaryEdges: (raw.boundary_edges ?? raw.boundaryEdges ?? []).map(
      (b: Record<string, unknown>) => ({
        id: b.id,
        nodeIds: b.node_ids ?? b.nodeIds,
        regionName: b.region_name ?? b.regionName,
      }),
    ),
    elementType: raw.element_type ?? raw.elementType,
    dimension: raw.dimension ?? 2,
    metadata: raw.metadata ?? {},
  }
}

/** Generate mesh from geometry operations + discretization settings. */
export async function generateFEMMesh(
  operations: GeoOperation[],
  settings: FEMDiscretizationSettings,
  variables?: Record<string, number>
): Promise<FEMMesh> {
  const request: MeshGenerateRequest = {
    geometry: { operations },
    discretization: toBackendDiscretization(settings),
    variables,
  }
  const response = await femPreprocessorClient.post('/api/fem/mesh/generate', request)
  const data = handleApiResponse<{ mesh: Record<string, unknown>; message: string }>(response)
  return toFEMMesh(data.mesh)
}

/** Import mesh from a file upload (.msh or .vtu). */
export async function importFEMMesh(file: File): Promise<FEMMesh> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await femPreprocessorClient.post('/api/fem/mesh/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return handleApiResponse<FEMMesh>(response)
}
