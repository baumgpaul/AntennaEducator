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
  _debug?: Record<string, unknown>
}> => {
  const nPoints = request.observation_points.length
  const nEdges = request.edges.length
  const nFreq = request.frequencies.length
  const totalEvals = nPoints * 19 * nFreq * nEdges
  const estSeconds = totalEvals * 5e-7 // ~0.5μs per eval (vectorized on Lambda 2048 MB)

  console.log(
    `[Postprocessor] Near-field request: ${nPoints} points, ${nEdges} edges, ${nFreq} freq(s)`,
    `| est. ${estSeconds.toFixed(1)}s`,
    `| ${(JSON.stringify(request).length / 1024).toFixed(0)} KB payload`,
  )

  if (estSeconds > 240) {
    console.warn(
      `[Postprocessor] ⚠️ Estimated computation time (${estSeconds.toFixed(0)}s) may exceed Lambda timeout.`,
      `Consider reducing observation points (currently ${nPoints}) or mesh density.`,
    )
  }

  const t0 = performance.now()
  try {
    const response = await postprocessorClient.post('/api/fields/near', request)
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2)
    console.log(`[Postprocessor] Near-field response received in ${elapsed}s, status=${response.status}`)

    const raw = handleApiResponse(response) as {
      status: string
      format?: string
      frequency: number
      num_points: number
      E_real?: number[]
      E_imag?: number[]
      H_real?: number[]
      H_imag?: number[]
      E_field?: ComplexVector[]
      H_field?: ComplexVector[]
      E_magnitudes: number[]
      H_magnitudes: number[]
      timestamp: string
      _debug?: Record<string, unknown>
    }

    if (raw._debug) {
      console.log('[Postprocessor] Backend debug info:', raw._debug)
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
        _debug: raw._debug,
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
  } catch (error: unknown) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2)
    const axiosErr = error as { response?: { status?: number; data?: unknown }; code?: string; message?: string }

    if (axiosErr.response) {
      console.error(
        `[Postprocessor] Near-field FAILED after ${elapsed}s`,
        `| HTTP ${axiosErr.response.status}`,
        `| body:`, axiosErr.response.data,
      )
      if (axiosErr.response.status === 502) {
        console.error(
          '[Postprocessor] 502 Bad Gateway — likely Lambda timeout.',
          `Estimated compute: ${estSeconds.toFixed(0)}s. Lambda timeout is 300s.`,
          `Reduce observation points (${nPoints}) or mesh edges (${nEdges}).`,
        )
      }
    } else if (axiosErr.code === 'ECONNABORTED') {
      console.error(
        `[Postprocessor] Request TIMED OUT after ${elapsed}s (client timeout: 300s).`,
        `Estimated compute: ${estSeconds.toFixed(0)}s.`,
      )
    } else {
      console.error(
        `[Postprocessor] Near-field FAILED after ${elapsed}s:`,
        axiosErr.message || error,
      )
    }
    throw error
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

// ============================================================================
// Port Quantities
// ============================================================================

export interface PortDefinitionInput {
  port_id: string
  node_start: number
  node_end: number
  z0: number
}

export interface PortQuantitiesRequestInput {
  frequency: number
  antenna_id: string
  node_voltages: Array<{ real: number; imag: number }>
  branch_currents: Array<{ real: number; imag: number }>
  appended_voltages?: Array<{ real: number; imag: number }>
  voltage_source_currents?: Array<{ real: number; imag: number }>
  edges: number[][]
  ports: PortDefinitionInput[]
}

export interface PortResultOutput {
  port_id: string
  z_in: { real: number; imag: number }
  gamma: { real: number; imag: number }
  s11_db: number
  vswr: number
  voltage: { real: number; imag: number }
  current: { real: number; imag: number }
  power_in: number
}

export interface PortQuantitiesResponseOutput {
  antenna_id: string
  frequency: number
  port_results: PortResultOutput[]
}

export const computePortQuantities = async (
  request: PortQuantitiesRequestInput,
): Promise<PortQuantitiesResponseOutput> => {
  const response = await postprocessorClient.post('/api/port-quantities', request)
  return handleApiResponse(response)
}

// Export all functions as a single object
const postprocessorApi = {
  checkHealth,
  computeNearField,
  computeFarField,
  computePortQuantities,
}

export default postprocessorApi
