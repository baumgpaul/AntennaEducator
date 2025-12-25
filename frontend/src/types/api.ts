/**
 * API-specific types and interfaces
 */

import type {
  DipoleConfig,
  LoopConfig,
  HelixConfig,
  RodConfig,
  PreprocessorResponse,
  SolverRequest,
  SolverResult,
  MultiFrequencySolverRequest,
  MultiFrequencySolverResult,
  FieldComputationRequest,
  FieldComputationResult,
  RadiationPatternRequest,
  RadiationPatternResult,
} from './models'

// ============================================================================
// API Client Configuration
// ============================================================================

export interface ApiConfig {
  baseURL: string
  timeout?: number
  headers?: Record<string, string>
}

export interface ApiError {
  message: string
  status?: number
  code?: string
  details?: Record<string, unknown>
}

// ============================================================================
// Preprocessor API
// ============================================================================

export interface PreprocessorAPI {
  createDipole(config: DipoleConfig): Promise<PreprocessorResponse>
  createLoop(config: LoopConfig): Promise<PreprocessorResponse>
  createHelix(config: HelixConfig): Promise<PreprocessorResponse>
  createRod(config: RodConfig): Promise<PreprocessorResponse>
  health(): Promise<{ status: string }>
}

// ============================================================================
// Solver API
// ============================================================================

export interface SolverAPI {
  solveSingle(request: SolverRequest): Promise<SolverResult>
  solveMultiFrequency(request: MultiFrequencySolverRequest): Promise<MultiFrequencySolverResult>
  health(): Promise<{ status: string }>
}

// ============================================================================
// Postprocessor API
// ============================================================================

export interface PostprocessorAPI {
  computeFields(request: FieldComputationRequest): Promise<FieldComputationResult>
  computeRadiationPattern(request: RadiationPatternRequest): Promise<RadiationPatternResult>
  health(): Promise<{ status: string }>
}

// ============================================================================
// Request/Response Interceptors
// ============================================================================

export type RequestInterceptor = (config: any) => any | Promise<any>
export type ResponseInterceptor = (response: any) => any | Promise<any>
export type ErrorInterceptor = (error: ApiError) => Promise<ApiError>
