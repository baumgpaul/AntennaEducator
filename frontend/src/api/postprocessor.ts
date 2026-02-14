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
 * Complex vector per observation point (reconstructed from flat arrays).
 */
interface ComplexVector {
  x: { real: number; imag: number }
  y: { real: number; imag: number }
  z: { real: number; imag: number }
  magnitude?: number
}

/**
 * Reconstruct complex-vector objects from flat [x0,y0,z0, x1,y1,z1, …] arrays.
 */
function unflattenVectors(
  real: number[],
  imag: number[],
  magnitudes?: number[],
): ComplexVector[] {
  const n = real.length / 3
  const vectors: ComplexVector[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const j = i * 3
    vectors[i] = {
      x: { real: real[j], imag: imag[j] },
      y: { real: real[j + 1], imag: imag[j + 1] },
      z: { real: real[j + 2], imag: imag[j + 2] },
      ...(magnitudes ? { magnitude: magnitudes[i] } : {}),
    }
  }
  return vectors
}

/**
 * Compute near-field at observation points.
 *
 * The backend returns a compact flat-array format to stay within Lambda's
 * 6 MB response payload limit.  This adapter reconstructs the per-point
 * complex-vector objects expected by the rest of the frontend.
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
  E_field: ComplexVector[]
  H_field: ComplexVector[]
  E_magnitudes: number[]
  H_magnitudes: number[]
  timestamp: string
}> => {
  const response = await postprocessorClient.post('/api/fields/near', request)
  const raw = handleApiResponse(response) as {
    status: string
    format?: string
    frequency: number
    num_points: number
    // compact flat-array format
    E_real?: number[]
    E_imag?: number[]
    H_real?: number[]
    H_imag?: number[]
    // legacy per-point format (kept for local dev backward compat)
    E_field?: ComplexVector[]
    H_field?: ComplexVector[]
    E_magnitudes: number[]
    H_magnitudes: number[]
    timestamp: string
  }

  // If the backend returns the compact flat format, reconstruct vectors
  if (raw.format === 'flat' && raw.E_real && raw.E_imag) {
    return {
      status: raw.status,
      frequency: raw.frequency,
      num_points: raw.num_points,
      E_field: unflattenVectors(raw.E_real, raw.E_imag, raw.E_magnitudes),
      H_field: unflattenVectors(raw.H_real!, raw.H_imag!, raw.H_magnitudes),
      E_magnitudes: raw.E_magnitudes,
      H_magnitudes: raw.H_magnitudes,
      timestamp: raw.timestamp,
    }
  }

  // Legacy format — pass through as-is
  return raw as {
    status: string
    frequency: number
    num_points: number
    E_field: ComplexVector[]
    H_field: ComplexVector[]
    E_magnitudes: number[]
    H_magnitudes: number[]
    timestamp: string
  }
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
