/**
 * Postprocessor API client
 * Handles field computation, radiation patterns, and antenna parameters
 */

import { postprocessorClient, handleApiResponse } from './client'
import type {
  FieldComputationRequest,
  FieldComputationResult,
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
 * Compute near-field at observation points
 * @param request Near-field computation request with geometry, currents, and observation points
 * @returns E and H field vectors and magnitudes at each point
 */
export const computeNearField = async (request: {
  frequencies: number[]
  branch_currents: Array<Array<number | string | { real: number; imag: number }>>
  nodes: number[][]
  edges: number[][]
  radii: number[]
  observation_points: number[][]
}): Promise<{
  status: string
  frequency: number
  num_points: number
  E_field: Array<{
    x: { real: number; imag: number }
    y: { real: number; imag: number }
    z: { real: number; imag: number }
    magnitude: number
  }>
  H_field: Array<{
    x: { real: number; imag: number }
    y: { real: number; imag: number }
    z: { real: number; imag: number }
    magnitude: number
  }>
  E_magnitudes: number[]
  H_magnitudes: number[]
  timestamp: string
}> => {
  console.log('[computeNearField] Sending request to backend:', {
    frequencies: request.frequencies,
    branch_currents_outer_length: request.branch_currents.length,
    branch_currents_inner_length: request.branch_currents[0]?.length,
    branch_currents_sample: JSON.stringify(request.branch_currents[0]?.slice(0, 2)),
    nodes_length: request.nodes.length,
    edges_length: request.edges.length,
    radii_length: request.radii.length,
    observation_points_length: request.observation_points.length,
  });
  
  try {
    const response = await postprocessorClient.post('/api/v1/fields/near', request)
    return handleApiResponse(response)
  } catch (error: any) {
    console.error('[computeNearField] Full error object:', error);
    console.error('[computeNearField] API Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      detail: error.response?.data?.detail,
      headers: error.response?.headers,
    });
    throw error;
  }
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
 * @param request Far-field computation request with geometry, currents, and angular resolution
 * @returns Radiation pattern with directivity, gain, and field magnitudes
 */
export const computeFarField = async (request: {
  frequencies: number[]
  branch_currents: Array<Array<number | string | { real: number; imag: number }>>
  nodes: number[][]
  edges: number[][]
  radii: number[]
  theta_points?: number
  phi_points?: number
}): Promise<{
  frequency: number
  theta_angles: number[]
  phi_angles: number[]
  E_theta_mag: number[]
  E_phi_mag: number[]
  E_total_mag: number[]
  pattern_db: number[]
  directivity: number
  gain: number
  efficiency: number
  beamwidth_theta?: number
  beamwidth_phi?: number
  max_direction: [number, number]
}> => {
  const response = await postprocessorClient.post('/api/v1/fields/far', {
    ...request,
    theta_points: request.theta_points || 19,
    phi_points: request.phi_points || 37,
  })
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
  computeFarField,
  computePatternPlanes,
  computeAntennaParameters,
  exportToVTK,
  exportPatternToCSV,
}

export default postprocessorApi
