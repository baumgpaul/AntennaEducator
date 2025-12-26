/**
 * Solver API client
 * Handles PEEC electromagnetic simulation
 */

import { solverClient, handleApiResponse } from './client'
import type {
  SolverRequest,
  SolverResult,
  MultiFrequencySolverRequest,
  MultiFrequencySolverResult,
} from '@/types/models'
import type {
  MultiAntennaRequest,
  MultiAntennaSolutionResponse,
} from '@/types/api'

// Export helper functions
export {
  convertToMultiAntennaRequest,
  parseComplex,
  complexMagnitude,
  complexPhase,
  formatComplex,
} from './solverHelpers'

// ============================================================================
// Health Check
// ============================================================================

export const checkHealth = async (): Promise<{ status: string }> => {
  const response = await solverClient.get('/health')
  return handleApiResponse(response)
}

// ============================================================================
// Solver Operations
// ============================================================================

/**
 * Solve for a single frequency
 */
export const solveSingle = async (request: SolverRequest): Promise<SolverResult> => {
  const response = await solverClient.post('/api/v1/solve/single', request)
  return handleApiResponse(response)
}

/**
 * Solve for multiple frequencies (frequency sweep)
 */
export const solveMultiFrequency = async (
  request: MultiFrequencySolverRequest
): Promise<MultiFrequencySolverResult> => {
  const response = await solverClient.post('/solve/multi', request)
  return handleApiResponse(response)
}

/**
 * Solve multiple antennas at a single frequency
 * This is the recommended method for all simulations as it:
 * - Handles single antennas (just pass one in the array)
 * - Handles antenna arrays (pass multiple antennas)
 * - Returns per-antenna solutions with impedance and currents
 */
export const solveMultiAntenna = async (
  request: MultiAntennaRequest
): Promise<MultiAntennaSolutionResponse> => {
  const response = await solverClient.post('/api/v1/solve/multi', request)
  return handleApiResponse(response)
}

/**
 * Solve with progress updates (long-running)
 * Returns a job ID that can be polled for status
 */
export const solveAsync = async (
  request: SolverRequest
): Promise<{ job_id: string }> => {
  const response = await solverClient.post('/solve/async', request)
  return handleApiResponse(response)
}

/**
 * Check status of async solve job
 */
export const getJobStatus = async (
  jobId: string
): Promise<{ status: string; progress?: number; result?: SolverResult }> => {
  const response = await solverClient.get(`/job/${jobId}`)
  return handleApiResponse(response)
}

/**
 * Cancel a running solve job
 */
export const cancelJob = async (jobId: string): Promise<{ success: boolean }> => {
  const response = await solverClient.delete(`/job/${jobId}`)
  return handleApiResponse(response)
}

// ============================================================================
// Matrix Information (for debugging)
// ============================================================================

/**
 * Get information about PEEC matrices without solving
 */
export const getMatrixInfo = async (
  request: Omit<SolverRequest, 'source_amplitude'>
): Promise<any> => {
  const response = await solverClient.post('/matrix-info', request)
  return handleApiResponse(response)
}

// Export all functions as a single object
const solverApi = {
  checkHealth,
  solveSingle,
  solveMultiFrequency,
  solveMultiAntenna,
  solveAsync,
  getJobStatus,
  cancelJob,
  getMatrixInfo,
}

export default solverApi
