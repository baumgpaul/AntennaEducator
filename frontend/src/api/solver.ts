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

/** Solves and field computations go through the solver's job endpoints (#77) */
export const ASYNC_JOBS = import.meta.env.VITE_ASYNC_JOBS === 'true'
/** A bit longer than the worker's 15 min Lambda limit */
export const JOB_TIMEOUT_MS = 16 * 60 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type JobStatus<T> = {
  job_id?: string
  status: 'queued' | 'running' | 'done' | 'failed'
  result?: T
  error?: string
}

/**
 * Run a request through a job endpoint (#77): CloudFront waits at most 60 s for
 * a single request. The backend answers small requests at once (status done)
 * and queues big ones, which are polled until they finish.
 */
export const runJob = async <T>(
  path: '/api/jobs/solve' | '/api/jobs/near-field' | '/api/jobs/far-field',
  request: unknown,
  { pollMs = [1000, 2000, 3000, 5000], timeoutMs = JOB_TIMEOUT_MS } = {},
): Promise<T> => {
  const submitted = handleApiResponse<JobStatus<T>>(await solverClient.post(path, request))
  if (submitted.status === 'done' && submitted.result) return submitted.result
  const started = Date.now()
  for (let attempt = 0; Date.now() - started < timeoutMs; attempt++) {
    await sleep(pollMs[Math.min(attempt, pollMs.length - 1)])
    const job = handleApiResponse<JobStatus<T>>(
      await solverClient.get(`/api/jobs/${submitted.job_id}`),
    )
    if (job.status === 'done' && job.result) return job.result
    if (job.status === 'failed') throw new Error(job.error || 'Job failed')
  }
  throw new Error('Job did not finish within 16 minutes')
}

export const solveAsJob = (request: MultiAntennaRequest, options?: Parameters<typeof runJob>[2]) =>
  runJob<MultiAntennaSolutionResponse>('/api/jobs/solve', request, options)

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
