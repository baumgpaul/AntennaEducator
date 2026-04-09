/**
 * FEM Postprocessor API — visualization data, line plots, point probes, export.
 */

import { femPostprocessorClient, handleApiResponse } from './client'
import type { FieldVisualizationData, LinePlotData, PointProbeResult } from '@/types/femResults'
import type { FEMSolverResult } from '@/types/femSolver'
import type { FEMMesh } from '@/types/femMesh'

/** Request field visualization data for Three.js rendering. */
export async function getFieldVisualization(
  mesh: FEMMesh,
  result: FEMSolverResult,
  fieldName: string
): Promise<FieldVisualizationData> {
  const response = await femPostprocessorClient.post('/api/fem/postprocess/field', {
    mesh,
    result,
    field_name: fieldName,
  })
  return handleApiResponse<FieldVisualizationData>(response)
}

/** Evaluate field along a line between two points. */
export async function getLinePlotData(
  mesh: FEMMesh,
  result: FEMSolverResult,
  fieldName: string,
  startPoint: [number, number],
  endPoint: [number, number],
  nPoints: number
): Promise<LinePlotData> {
  const response = await femPostprocessorClient.post('/api/fem/postprocess/line-plot', {
    mesh,
    result,
    field_name: fieldName,
    start_point: startPoint,
    end_point: endPoint,
    n_points: nPoints,
  })
  return handleApiResponse<LinePlotData>(response)
}

/** Evaluate field at a specific point (probe). */
export async function getPointProbe(
  mesh: FEMMesh,
  result: FEMSolverResult,
  x: number,
  y: number
): Promise<PointProbeResult> {
  const response = await femPostprocessorClient.post('/api/fem/postprocess/point-probe', {
    mesh,
    result,
    x,
    y,
  })
  return handleApiResponse<PointProbeResult>(response)
}

/** Export results as VTK (.vtu) file. */
export async function exportVTK(
  mesh: FEMMesh,
  result: FEMSolverResult
): Promise<Blob> {
  const response = await femPostprocessorClient.post(
    '/api/fem/postprocess/export/vtk',
    { mesh, result },
    { responseType: 'blob' }
  )
  return response.data as Blob
}
