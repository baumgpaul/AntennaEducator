/**
 * Postprocessor API client
 * Handles field computation and radiation patterns
 */

import { postprocessorClient, handleApiResponse } from './client'

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
 * Compute near-field at observation points
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
  const response = await postprocessorClient.post('/api/fields/near', request)
  return handleApiResponse(response)
}

// ============================================================================
// Radiation Pattern
// ============================================================================

/**
 * Compute far-field radiation pattern
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
  const response = await postprocessorClient.post('/api/fields/far', {
    ...request,
    theta_points: request.theta_points || 19,
    phi_points: request.phi_points || 37,
  })
  return handleApiResponse(response)
}

// Export all functions as a single object
const postprocessorApi = {
  checkHealth,
  computeNearField,
  computeFarField,
}

export default postprocessorApi
