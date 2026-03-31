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

export interface Point3D {
  x: number
  y: number
  z: number
}

export type Vector3D = [number, number, number]

// ============================================================================
// Geometry and Mesh Types
// ============================================================================

export interface Node {
  id: number
  position: Vector3D
}

export interface Edge {
  id: number
  node_start: number // 1-based index
  node_end: number // 1-based index
  radius: number
  tag?: string
}

export interface Mesh {
  nodes: Vector3D[] // List of [x, y, z] coordinates
  edges: [number, number][] // List of [start_idx, end_idx] (0-based)
  radii: number[] // Wire radius for each edge
  metadata?: {
    total_length?: number
    num_segments?: number
    [key: string]: any
  }
  vertices?: Vector3D[] // Alternative to nodes for some legacy uses
  faces?: any[] // For future 3D surface support
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

export interface HelixConfig {
  radius: number
  turns: number
  pitch: number
  center_position?: Vector3D
  axis_direction?: Vector3D
  wire_radius?: number
  segments_per_turn?: number
  source?: Source
  lumped_elements?: LumpedElement[]
  helix_mode?: 'axial' | 'normal'
  polarization?: 'RHCP' | 'LHCP'
  start_angle?: number
}

/** @deprecated Helix antenna type removed. Kept for backward compatibility with old projects. */
export type _HelixConfigDeprecated = HelixConfig

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
  element: any // AntennaElement data
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

export interface MultiFrequencySolverRequest extends Omit<SolverRequest, 'frequency'> {
  frequencies: number[]
}

export interface MultiFrequencySolverResult {
  project_id: string
  frequencies: number[]
  results: SolverResult[]
  computation_time_seconds: number
}

// ============================================================================
// Postprocessor Types
// ============================================================================

export interface FieldPoint {
  position: Vector3D
  E_field?: Vector3D
  H_field?: Vector3D
  power_density?: number
}

export interface FieldComputationRequest {
  project_id: string
  frequency: number
  nodes: Vector3D[]
  edges: [number, number][]
  branch_currents: ComplexNumber[]
  field_points: Vector3D[]
}

export interface FieldComputationResult {
  project_id: string
  frequency: number
  field_points: FieldPoint[]
  max_field_magnitude: number
}

export interface RadiationPatternRequest {
  project_id: string
  frequency: number
  nodes: Vector3D[]
  edges: [number, number][]
  branch_currents: ComplexNumber[]
  theta_range?: [number, number]
  phi_range?: [number, number]
  theta_points?: number
  phi_points?: number
}

export interface RadiationPatternPoint {
  theta: number // radians
  phi: number // radians
  gain_dB: number
  E_theta: ComplexNumber
  E_phi: ComplexNumber
}

export interface RadiationPatternResult {
  project_id: string
  frequency: number
  pattern_points: RadiationPatternPoint[]
  max_gain_dB: number
  max_gain_direction: [number, number] // [theta, phi]
  directivity: number
  radiation_efficiency?: number
}

// ============================================================================
// Project and Simulation Types
// ============================================================================

export interface Project {
  id: string | number  // Backend uses integer IDs, mock API uses string IDs
  name: string
  description?: string
  design_state?: Record<string, any>       // Elements, sources, positions — versioned snapshot
  simulation_config?: Record<string, any>  // Method, frequency config, requested fields, postprocessing
  simulation_results?: Record<string, any> // Solver output summary + S3 keys
  ui_state?: Record<string, any>           // View configs, selected tabs, camera position
  has_documentation?: boolean              // Whether project has documentation content
  documentation_preview?: string           // Plain-text preview of documentation content
  user_id?: string | number
  folder_id?: string | null               // Folder this project belongs to (null = root)
  source_project_id?: string | null       // If copied from a course project, the original project ID
  created_at: string
  updated_at: string
  last_opened_at?: string | null          // When the project was last opened
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

export interface SimulationConfig {
  id: string
  simulation_id: string
  frequency_start: number
  frequency_end: number
  frequency_points: number
  config_json?: Record<string, unknown>
  created_at: string
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ============================================================================
// Authentication Types
// ============================================================================

export type UserRole = 'user' | 'maintainer' | 'admin'

export interface User {
  id: string
  email: string
  username: string
  is_approved: boolean
  is_admin: boolean
  role?: UserRole
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
