/**
 * Postprocessor API client
 * Handles field computation, radiation patterns, and antenna parameters
 */

import { postprocessorClient, handleApiResponse } from './client'
import type {
  FieldComputationRequest,
  FieldComputationResult,
  RadiationPatternRequest,
  RadiationPatternResult,
} from '@/types/models'

// ============================================================================
// Health Check
// ============================================================================

export const checkHealth = async (): Promise<{ status: string }> => {
  const response = await postprocessorClient.get('/health')
  return handleApiResponse(response)
}

// ============================================================================
// Field Computation
// ============================================================================

/**
 * Compute electromagnetic fields at specified points
 */
export const computeFields = async (
  request: FieldComputationRequest
): Promise<FieldComputationResult> => {
  const response = await postprocessorClient.post('/fields', request)
  return handleApiResponse(response)
}

/**
 * Compute fields on a grid (for visualization)
 */
export const computeFieldGrid = async (request: {
  project_id: string
  frequency: number
  nodes: [number, number, number][]
  edges: [number, number][]
  branch_currents: { real: number; imag: number }[]
  grid_bounds: {
    x_min: number
    x_max: number
    y_min: number
    y_max: number
    z_min: number
    z_max: number
  }
  grid_resolution: [number, number, number]
}): Promise<FieldComputationResult> => {
  const response = await postprocessorClient.post('/fields/grid', request)
  return handleApiResponse(response)
}

// ============================================================================
// Radiation Pattern
// ============================================================================

/**
 * Compute far-field radiation pattern
 */
export const computeRadiationPattern = async (
  request: RadiationPatternRequest
): Promise<RadiationPatternResult> => {
  const response = await postprocessorClient.post('/radiation-pattern', request)
  return handleApiResponse(response)
}

/**
 * Compute radiation pattern on specific planes (E-plane, H-plane)
 */
export const computePatternPlanes = async (request: {
  project_id: string
  frequency: number
  nodes: [number, number, number][]
  edges: [number, number][]
  branch_currents: { real: number; imag: number }[]
  planes: ('E-plane' | 'H-plane' | 'xy' | 'xz' | 'yz')[]
  points_per_plane?: number
}): Promise<any> => {
  const response = await postprocessorClient.post('/radiation-pattern/planes', request)
  return handleApiResponse(response)
}

// ============================================================================
// Antenna Parameters
// ============================================================================

/**
 * Compute antenna parameters (gain, directivity, efficiency, etc.)
 */
export const computeAntennaParameters = async (request: {
  project_id: string
  frequency: number
  nodes: [number, number, number][]
  edges: [number, number][]
  branch_currents: { real: number; imag: number }[]
  input_impedance?: { real: number; imag: number }
  input_power?: number
}): Promise<{
  directivity: number
  gain_dB: number
  radiation_efficiency: number
  front_to_back_ratio?: number
  half_power_beamwidth?: { E_plane: number; H_plane: number }
}> => {
  const response = await postprocessorClient.post('/antenna-parameters', request)
  return handleApiResponse(response)
}

// ============================================================================
// Export Results
// ============================================================================

/**
 * Export field data to VTK format for ParaView
 */
export const exportToVTK = async (
  fieldData: FieldComputationResult
): Promise<Blob> => {
  const response = await postprocessorClient.post(
    '/export/vtk',
    fieldData,
    { responseType: 'blob' }
  )
  return response.data
}

/**
 * Export radiation pattern to CSV
 */
export const exportPatternToCSV = async (
  patternData: RadiationPatternResult
): Promise<Blob> => {
  const response = await postprocessorClient.post(
    '/export/csv',
    patternData,
    { responseType: 'blob' }
  )
  return response.data
}

// Export all functions as a single object
const postprocessorApi = {
  checkHealth,
  computeFields,
  computeFieldGrid,
  computeRadiationPattern,
  computePatternPlanes,
  computeAntennaParameters,
  exportToVTK,
  exportPatternToCSV,
}

export default postprocessorApi
