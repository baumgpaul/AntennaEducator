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
// Multi-Antenna Solver Types
// ============================================================================

export interface VoltageSourceInput {
  node_start: number  // 1-based
  node_end: number    // 0 = ground
  value: number | { real: number; imag: number }
  R?: number         // Resistance [Ω]
  L?: number         // Inductance [H]
  C_inv?: number     // Inverse capacitance [1/F]
}

export interface CurrentSourceInput {
  node: number  // 1-based, negative for appended
  value: number | { real: number; imag: number }
}

export interface LoadInput {
  node_start: number  // 1-based
  node_end: number
  R?: number         // Resistance [Ω]
  L?: number         // Inductance [H]
  C_inv?: number     // Inverse capacitance [1/F]
}

export interface AntennaInput {
  antenna_id: string
  nodes: number[][]           // [[x,y,z], ...] in meters
  edges: number[][]           // [[start, end], ...] 1-based
  radii: number[]             // Wire radius per edge [m]
  voltage_sources: VoltageSourceInput[]
  current_sources: CurrentSourceInput[]
  loads: LoadInput[]
}

export interface SolverConfiguration {
  gauss_order?: number         // 2, 4, 6, 8, or 10
  include_skin_effect?: boolean
  resistivity?: number         // [Ω·m]
  permeability?: number        // Relative μ_r
}

export interface MultiAntennaRequest {
  frequency: number            // [Hz]
  antennas: AntennaInput[]
  config?: SolverConfiguration
}

export interface AntennaSolution {
  antenna_id: string
  branch_currents: Array<number | string | { real: number; imag: number }>
  voltage_source_currents: Array<number | string | { real: number; imag: number }>
  load_currents: Array<number | string | { real: number; imag: number }>
  node_voltages: Array<number | string | { real: number; imag: number }>
  appended_voltages: Array<number | string | { real: number; imag: number }>
  input_impedance: number | string | { real: number; imag: number } | null
}

export interface MultiAntennaSolutionResponse {
  frequency: number
  converged: boolean
  antenna_solutions: AntennaSolution[]
  n_total_nodes: number
  n_total_edges: number
  solve_time: number
}

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
  solveMultiAntenna(request: MultiAntennaRequest): Promise<MultiAntennaSolutionResponse>
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
