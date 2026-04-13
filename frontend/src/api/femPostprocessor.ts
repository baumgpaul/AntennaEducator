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

/** Export results as CSV file. */
export async function exportCSV(
  mesh: FEMMesh,
  result: FEMSolverResult
): Promise<Blob> {
  const response = await femPostprocessorClient.post(
    '/api/fem/postprocess/export/csv',
    { mesh, result },
    { responseType: 'blob' }
  )
  return response.data as Blob
}

// ── Integral quantities ───────────────────────────────────────

export interface SurfaceChargeResult {
  charge: number
  boundary_name: string
  unit: string
}

export interface CapacitanceResult {
  capacitance: number
  charge: number
  voltage_difference: number
  electrode_boundary: string
  unit: string
}

export interface BoundaryCurrentResult {
  current: number
  boundary_name: string
  unit: string
}

export interface ResistanceResult {
  resistance: number
  current: number
  voltage_difference: number
  electrode_boundary: string
  unit: string
}

/** Compute surface charge Q = ∫ D·n dΓ on a boundary. */
export async function getSurfaceCharge(
  mesh: FEMMesh,
  result: FEMSolverResult,
  boundaryName: string
): Promise<SurfaceChargeResult> {
  const vectorFields: Record<string, unknown> = {}
  for (const vf of result.vectorFields) {
    vectorFields[vf.name] = {
      field_name: vf.name,
      element_values: vf.values,
      unit: vf.unit,
      max_magnitude: vf.maxMagnitude,
    }
  }

  const response = await femPostprocessorClient.post('/api/fem/postprocess/charge', {
    mesh,
    vector_fields: vectorFields,
    boundary_name: boundaryName,
  })
  return handleApiResponse<SurfaceChargeResult>(response)
}

/** Compute capacitance C = |Q| / V between electrodes. */
export async function getCapacitance(
  mesh: FEMMesh,
  result: FEMSolverResult,
  electrodeBoundary: string,
  voltageDifference: number
): Promise<CapacitanceResult> {
  const vectorFields: Record<string, unknown> = {}
  for (const vf of result.vectorFields) {
    vectorFields[vf.name] = {
      field_name: vf.name,
      element_values: vf.values,
      unit: vf.unit,
      max_magnitude: vf.maxMagnitude,
    }
  }

  const response = await femPostprocessorClient.post('/api/fem/postprocess/capacitance', {
    mesh,
    vector_fields: vectorFields,
    electrode_boundary: electrodeBoundary,
    voltage_difference: voltageDifference,
  })
  return handleApiResponse<CapacitanceResult>(response)
}

/** Compute current through a boundary: I = ∫ J·n dΓ. */
export async function getBoundaryCurrent(
  mesh: FEMMesh,
  result: FEMSolverResult,
  boundaryName: string
): Promise<BoundaryCurrentResult> {
  const vectorFields: Record<string, unknown> = {}
  for (const vf of result.vectorFields) {
    vectorFields[vf.name] = {
      field_name: vf.name,
      element_values: vf.values,
      unit: vf.unit,
      max_magnitude: vf.maxMagnitude,
    }
  }

  const response = await femPostprocessorClient.post('/api/fem/postprocess/current', {
    mesh,
    vector_fields: vectorFields,
    boundary_name: boundaryName,
  })
  return handleApiResponse<BoundaryCurrentResult>(response)
}

/** Compute resistance R = V/I between electrodes. */
export async function getResistance(
  mesh: FEMMesh,
  result: FEMSolverResult,
  electrodeBoundary: string,
  voltageDifference: number
): Promise<ResistanceResult> {
  const vectorFields: Record<string, unknown> = {}
  for (const vf of result.vectorFields) {
    vectorFields[vf.name] = {
      field_name: vf.name,
      element_values: vf.values,
      unit: vf.unit,
      max_magnitude: vf.maxMagnitude,
    }
  }

  const response = await femPostprocessorClient.post('/api/fem/postprocess/resistance', {
    mesh,
    vector_fields: vectorFields,
    electrode_boundary: electrodeBoundary,
    voltage_difference: voltageDifference,
  })
  return handleApiResponse<ResistanceResult>(response)
}
