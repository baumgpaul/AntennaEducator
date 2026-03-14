/**
 * FDTD Postprocessor API client.
 *
 * Backend: http://localhost:8006  (VITE_FDTD_POSTPROCESSOR_URL)
 */

import { fdtdPostprocessorClient, handleApiResponse } from './client'
import type {
  FieldSnapshotRequest,
  FieldSnapshotResponse,
  PoyntingRequest,
  PoyntingResponse,
  RadiationPatternResponse,
  FrequencyFieldRequest,
  FrequencyFieldResponse,
  SarRequest,
  SarResponse,
  RcsRequest,
  RcsResponse,
  SParamRequest,
  SParamResponse,
} from '@/types/fdtd'

export const checkHealth = async () => {
  const response = await fdtdPostprocessorClient.get('/health')
  return handleApiResponse<{ status: string }>(response)
}

export const extractFieldSnapshot = async (
  request: FieldSnapshotRequest,
): Promise<FieldSnapshotResponse> => {
  const response = await fdtdPostprocessorClient.post('/api/fdtd/fields/extract', request)
  return handleApiResponse(response)
}

export const computePoyntingVector = async (
  request: PoyntingRequest,
): Promise<PoyntingResponse> => {
  const response = await fdtdPostprocessorClient.post('/api/fdtd/energy', request)
  return handleApiResponse(response)
}

export const computeRadiationPattern = async (request: {
  e_field: number[][]
  h_field_x: number[][]
  h_field_y: number[][]
  frequency_hz: number
  dx: number
  dy: number
  num_angles?: number
}): Promise<RadiationPatternResponse> => {
  const response = await fdtdPostprocessorClient.post('/api/fdtd/pattern/radiation', request)
  return handleApiResponse(response)
}

export const extractFrequencyField = async (
  request: FrequencyFieldRequest,
): Promise<FrequencyFieldResponse> => {
  const response = await fdtdPostprocessorClient.post('/api/fdtd/fields/frequency', request)
  return handleApiResponse(response)
}

export const computeSar = async (request: SarRequest): Promise<SarResponse> => {
  const response = await fdtdPostprocessorClient.post('/api/fdtd/sar', request)
  return handleApiResponse(response)
}

export const computeRcs = async (request: RcsRequest): Promise<RcsResponse> => {
  const response = await fdtdPostprocessorClient.post('/api/fdtd/rcs', request)
  return handleApiResponse(response)
}

export const computeSParams = async (request: SParamRequest): Promise<SParamResponse> => {
  const response = await fdtdPostprocessorClient.post('/api/fdtd/sparams', request)
  return handleApiResponse(response)
}
