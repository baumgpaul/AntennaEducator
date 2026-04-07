/**
 * Core type definitions matching backend Pydantic models
 */

// ============================================================================
// Common Types
// ============================================================================

export interface ComplexNumber {
  real: number
  imag: number
}

export type Vector3D = [number, number, number]

export interface Mesh {
  nodes: Vector3D[] // List of [x, y, z] coordinates
  edges: [number, number][] // List of [start_idx, end_idx] (0-based)
  radii: number[] // Wire radius for each edge
  metadata?: {
    total_length?: number
    num_segments?: number
    [key: string]: unknown
  }
  vertices?: Vector3D[] // Alternative to nodes for some legacy uses
}

// ============================================================================
// Source and Lumped Element Types
// ============================================================================

export type SourceType = 'voltage' | 'current'

export interface Source {
  type: SourceType
  amplitude: ComplexNumber | string | number // Support complex, string format ("1+0j"), or number
  node_start?: number // 1-based index (optional for generated geometries like Loop)
  node_end?: number // 1-based index (optional for generated geometries like Loop)
  position?: string | number // 'center', 'base', or segment index
  series_R?: number
  series_L?: number
  series_C_inv?: number
  tag?: string
}

export type LumpedElementType = 'resistor' | 'inductor' | 'capacitor' | 'rlc'

export interface LumpedElement {
  type: LumpedElementType
  R: number
  L: number
  C_inv: number
  node_start: number
  node_end: number
  tag?: string
}

export interface Port {
  id: string            // UUID
  node_start: number    // 1-based mesh node index
  node_end: number      // 1-based mesh node index (0 = ground)
  z0: number            // Characteristic impedance [Ω], default 50
  label?: string        // User label, e.g. "Port 1"
}

// ============================================================================
// Antenna Builder Types
// ============================================================================

export interface DipoleConfig {
  length: number
  center_position?: Vector3D
  orientation?: Vector3D
  wire_radius?: number
  gap?: number
  segments?: number
  source?: Source
  lumped_elements?: LumpedElement[]
  balanced_feed?: boolean
}

export interface LoopConfig {
  loop_type: 'circular' | 'rectangular' | 'polygon'
  radius?: number // for circular
  width?: number // for rectangular
  height?: number // for rectangular
  vertices?: Vector3D[] // for polygon
  center_position?: Vector3D
  normal_vector?: Vector3D
  wire_radius?: number
  gap?: number // feed gap
  segments?: number
  source?: Source
  lumped_elements?: LumpedElement[]
}

export interface RodConfig {
  length: number
  base_position?: Vector3D
  direction?: Vector3D
  wire_radius?: number
  segments?: number
  source?: Source
  lumped_elements?: LumpedElement[]
  // Optional explicit endpoints used by UI
  start_point?: Vector3D
  end_point?: Vector3D
}

export interface CustomConfig {
  name?: string
  nodes: Array<{ id: number; x: number; y: number; z: number; radius?: number }>
  edges: Array<{ node_start: number; node_end: number; radius?: number }>
  sources?: Array<{
    type: 'voltage' | 'current'
    amplitude: { real: number; imag: number }
    node_start: number
    node_end: number
    series_R?: number
    series_L?: number
    series_C_inv?: number
    tag?: string
  }>
  lumped_elements?: Array<{
    type: string
    R?: number
    L?: number
    C_inv?: number
    node_start: number
    node_end: number
    tag?: string
  }>
  variable_context?: Array<{ name: string; expression: string; unit?: string; description?: string }>
}

// ============================================================================
// Multi-Element System Types
// ============================================================================

export type AntennaType = 'dipole' | 'loop' | 'rod' | 'custom'

export interface AppendedNode {
  index: number  // Negative integer
  label: string
}

export interface AntennaElement {
  id: string
  type: AntennaType
  name: string
  config: DipoleConfig | LoopConfig | RodConfig | CustomConfig
  position: Vector3D
  rotation: Vector3D  // Euler angles (rx, ry, rz) in radians
  mesh: Mesh
  sources?: Source[]  // Voltage/current sources
  lumped_elements?: LumpedElement[]  // Loads (R, L, C)
  ports?: Port[]  // Measurement ports for Z, Γ, S11, VSWR
  appended_nodes?: AppendedNode[]  // User-created auxiliary circuit nodes
  visible: boolean
  locked: boolean
  color?: string  // Hex color string (e.g., '#FF8C00')
  /** Expression strings for geometry fields (e.g., { length: "wavelength / 2" }). */
  expressions?: Record<string, string>
  created_at?: string
  updated_at?: string
}

// ============================================================================
// Preprocessor API Types
// ============================================================================

export interface PreprocessorResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: any
  mesh: Mesh
  message: string
}

// ============================================================================
// Solver Types
// ============================================================================

export interface SolverRequest {
  project_id: string
  frequency: number
  nodes: Vector3D[]
  edges: [number, number][]
  radii: number[]
  source_node_start: number // 1-based
  source_node_end: number // 1-based
  source_type: SourceType
  source_amplitude: ComplexNumber
}

export interface SolverResult {
  project_id: string
  frequency: number
  branch_currents: ComplexNumber[]
  node_voltages?: ComplexNumber[]
  input_impedance?: ComplexNumber
  input_power?: number
  converged: boolean
  iterations?: number
  residual?: number
}

// ============================================================================
// Project and Simulation Types
// ============================================================================

export interface Project {
  id: string | number
  name: string
  description?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  design_state?: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  simulation_config?: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  simulation_results?: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ui_state?: Record<string, any>
  has_documentation?: boolean
  documentation_preview?: string
  user_id?: string | number
  folder_id?: string | null
  source_project_id?: string | null
  created_at: string
  updated_at: string
  last_opened_at?: string | null
}

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Simulation {
  id: string
  project_id: string
  name: string
  status: SimulationStatus
  geometry_url?: string
  mesh_url?: string
  results_url?: string
  error_message?: string
  created_at: string
  updated_at: string
  completed_at?: string
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface User {
  id: string
  email: string
  username: string
  is_approved: boolean
  is_admin: boolean
  role?: 'user' | 'maintainer' | 'admin'
  cognito_sub?: string
  created_at: string
  simulation_tokens?: number
  flatrate_until?: string | null
}

export interface AuthTokens {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  username: string
  password: string
}
