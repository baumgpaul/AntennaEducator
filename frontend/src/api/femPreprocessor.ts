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
  variable_context?: Record<string, number>
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

/** Generate mesh from geometry operations + discretization settings. */
export async function generateFEMMesh(
  operations: GeoOperation[],
  settings: FEMDiscretizationSettings,
  variables?: Record<string, number>
): Promise<FEMMesh> {
  const request: MeshGenerateRequest = {
    geometry: { operations },
    discretization: toBackendDiscretization(settings),
    variable_context: variables,
  }
  const response = await femPreprocessorClient.post('/api/fem/mesh/generate', request)
  return handleApiResponse<FEMMesh>(response)
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
