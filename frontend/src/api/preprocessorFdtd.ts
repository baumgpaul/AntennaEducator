/**
 * FDTD Preprocessor API client.
 *
 * Backend: http://localhost:8004  (VITE_FDTD_PREPROCESSOR_URL)
 */

import { fdtdPreprocessorClient, handleApiResponse } from './client'
import type {
  FdtdMeshRequest,
  FdtdMeshResponse,
  FdtdValidationRequest,
  FdtdValidationResponse,
} from '@/types/fdtd'

export const checkHealth = async () => {
  const response = await fdtdPreprocessorClient.get('/health')
  return handleApiResponse<{ status: string }>(response)
}

export const generateMesh = async (request: FdtdMeshRequest): Promise<FdtdMeshResponse> => {
  const response = await fdtdPreprocessorClient.post('/api/fdtd/mesh', request)
  return handleApiResponse(response)
}

export const validateSetup = async (
  request: FdtdValidationRequest,
): Promise<FdtdValidationResponse> => {
  const response = await fdtdPreprocessorClient.post('/api/fdtd/validate', request)
  return handleApiResponse(response)
}
