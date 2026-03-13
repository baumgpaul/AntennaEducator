/**
 * FDTD Solver API client.
 *
 * Backend: http://localhost:8005  (VITE_SOLVER_FDTD_URL)
 */

import { fdtdSolverClient, handleApiResponse } from './client'
import type { FdtdSolveRequest, FdtdSolveResponse } from '@/types/fdtd'

export const checkHealth = async () => {
  const response = await fdtdSolverClient.get('/health')
  return handleApiResponse<{ status: string; solver_type: string }>(response)
}

export const solve = async (request: FdtdSolveRequest): Promise<FdtdSolveResponse> => {
  const response = await fdtdSolverClient.post('/api/fdtd/solve', request)
  return handleApiResponse(response)
}

export const getSolverConfig = async () => {
  const response = await fdtdSolverClient.get('/api/fdtd/solve/config')
  return handleApiResponse(response)
}
