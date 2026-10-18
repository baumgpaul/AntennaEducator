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

const ASYNC_JOBS = import.meta.env.VITE_ASYNC_JOBS === 'true'
/** A bit longer than the worker's 15 min Lambda limit */
export const JOB_TIMEOUT_MS = 16 * 60 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Queue a solve and poll until it is done (#77). Used when the backend runs
 * solves as jobs: CloudFront waits at most 60 s for a single request.
 */
export const solveAsJob = async (
  request: MultiAntennaRequest,
  { pollMs = [1000, 2000, 3000, 5000], timeoutMs = JOB_TIMEOUT_MS } = {},
): Promise<MultiAntennaSolutionResponse> => {
  const submitted = handleApiResponse<{ job_id: string }>(
    await solverClient.post('/api/jobs/solve', request),
  )
  const started = Date.now()
  for (let attempt = 0; Date.now() - started < timeoutMs; attempt++) {
    await sleep(pollMs[Math.min(attempt, pollMs.length - 1)])
    const job = handleApiResponse<{
      status: 'queued' | 'running' | 'done' | 'failed'
      result?: MultiAntennaSolutionResponse
      error?: string
    }>(await solverClient.get(`/api/jobs/${submitted.job_id}`))
    if (job.status === 'done' && job.result) return job.result
    if (job.status === 'failed') throw new Error(job.error || 'Solve failed')
  }
  throw new Error('Solve did not finish within 16 minutes')
}

/**
 * Solve multiple antennas at a single frequency.
 * This is the primary solver endpoint — handles both single and multi-antenna cases.
 */
export const solveMultiAntenna = async (
  request: MultiAntennaRequest
): Promise<MultiAntennaSolutionResponse> => {
  if (ASYNC_JOBS) return solveAsJob(request)
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
