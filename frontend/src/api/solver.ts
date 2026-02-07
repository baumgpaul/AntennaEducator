/**
 * Solver API client
 * Handles PEEC electromagnetic simulation
 */

import { solverClient, handleApiResponse } from './client'
import type {
  SolverRequest,
  SolverResult,
} from '@/types/models'
import type {
  MultiAntennaRequest,
  MultiAntennaSolutionResponse,
} from '@/types/api'

// Export helper functions
export {
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
  const response = await solverClient.post('/api/solve/single', request)
  return handleApiResponse(response)
}

/**
 * Solve multiple antennas at a single frequency.
 * This is the primary solver endpoint — handles both single and multi-antenna cases.
 */
export const solveMultiAntenna = async (
  request: MultiAntennaRequest
): Promise<MultiAntennaSolutionResponse> => {
  const response = await solverClient.post('/api/solve/multi', request)
  return handleApiResponse(response)
}

// Export all functions as a single object
const solverApi = {
  checkHealth,
  solveSingle,
  solveMultiAntenna,
}

export default solverApi
