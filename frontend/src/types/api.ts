/**
 * API-specific types and interfaces
 */



// ============================================================================
// Multi-Antenna Solver Types
// ============================================================================

export interface VoltageSourceInput {
  node_start: number  // 1-based
  node_end: number    // 0 = ground
  value: number | string  // number for real-only, string "a+bj" for complex
  R?: number         // Resistance [Ω]
  L?: number         // Inductance [H]
  C_inv?: number     // Inverse capacitance [1/F]
}

export interface CurrentSourceInput {
  node: number  // 1-based, negative for appended
  value: number | string  // number for real-only, string "a+bj" for complex
  node_end?: number  // Return node for two-terminal current source (closed loop feed)
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
// API Error
// ============================================================================

export interface ApiError {
  message: string
  status?: number
  code?: string
  details?: Record<string, unknown>
}

// ============================================================================
// Frequency Sweep Types
// ============================================================================

export type FrequencySpacing = 'linear' | 'logarithmic'

export interface FrequencySweepParams {
  startFrequency: number  // [Hz]
  stopFrequency: number   // [Hz]
  numPoints: number       // Number of frequency points
  spacing: FrequencySpacing
}

export interface FrequencySweepResult {
  frequencies: number[]  // Array of frequencies [Hz]
  results: MultiAntennaSolutionResponse[]  // Solver results per frequency
  completedCount: number  // Number of completed simulations
  totalCount: number      // Total simulations to run
  isComplete: boolean     // All simulations finished
  currentDistributions: Array<{  // Current magnitudes per frequency
    frequency: number
    currents: number[][]  // [antenna_idx][edge_idx] -> |I|
  }>
}
