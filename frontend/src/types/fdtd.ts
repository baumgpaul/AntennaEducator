/**
 * FDTD-specific TypeScript types, mirroring backend Pydantic models
 * in backend/common/models/fdtd.py and service schemas.
 */

// ============================================================================
// Material
// ============================================================================

export interface FdtdMaterial {
  name: string
  epsilon_r: number
  mu_r: number
  sigma: number
  color: string
}

// ============================================================================
// Structure
// ============================================================================

export type FdtdStructureType = 'box' | 'cylinder' | 'sphere' | 'substrate' | 'trace'

export interface FdtdStructure {
  id: string
  name: string
  type: FdtdStructureType
  position: [number, number, number]
  dimensions: Record<string, number>
  material: string
  custom_material?: FdtdMaterial
}

// ============================================================================
// Source
// ============================================================================

export type FdtdSourceType =
  | 'gaussian_pulse'
  | 'sinusoidal'
  | 'modulated_gaussian'
  | 'plane_wave'
  | 'waveguide_port'

export interface FdtdSource {
  id: string
  name: string
  type: FdtdSourceType
  position: [number, number, number]
  parameters: Record<string, number>
  polarization: 'x' | 'y' | 'z'
}

// ============================================================================
// Boundary Conditions
// ============================================================================

export type BoundaryType = 'mur_abc' | 'pec' | 'pmc' | 'periodic'

export interface BoundaryCondition {
  type: BoundaryType
}

export interface DomainBoundaries {
  x_min: BoundaryCondition
  x_max: BoundaryCondition
  y_min: BoundaryCondition
  y_max: BoundaryCondition
  z_min: BoundaryCondition
  z_max: BoundaryCondition
}

// ============================================================================
// Probe
// ============================================================================

export type FdtdProbeType = 'point' | 'line' | 'plane'
export type FieldComponent = 'Ex' | 'Ey' | 'Ez' | 'Hx' | 'Hy' | 'Hz'

export interface FdtdProbe {
  id: string
  name: string
  type: FdtdProbeType
  position: [number, number, number]
  direction?: [number, number, number]
  extent?: [number, number]
  fields: FieldComponent[]
}

// ============================================================================
// Geometry & Config
// ============================================================================

export interface FdtdGeometry {
  domain_size: [number, number, number]
  cell_size: [number, number, number]
  structures: FdtdStructure[]
  sources: FdtdSource[]
  boundaries: DomainBoundaries
  probes: FdtdProbe[]
}

export interface FdtdConfig {
  num_time_steps: number
  courant_number: number
  output_every_n_steps: number
  dft_frequencies: number[]
  auto_shutoff_threshold: number
}

// ============================================================================
// Solver Request / Response
// ============================================================================

export type FdtdDimensionality = '1d' | '2d'
export type FdtdMode = 'tm' | 'te'

export interface FdtdSolveRequest {
  dimensionality: FdtdDimensionality
  domain_size: [number, number, number]
  cell_size: [number, number, number]
  structures: FdtdStructure[]
  sources: FdtdSource[]
  boundaries: DomainBoundaries
  probes: FdtdProbe[]
  config: Partial<FdtdConfig>
  mode: FdtdMode
}

export interface ProbeResult {
  name: string
  field_component: string
  position: Record<string, number>
  times: number[]
  values: number[]
  snapshots?: unknown[]
}

export interface FdtdSolveResponse {
  dimensionality: string
  mode: string
  total_time_steps: number
  dt: number
  solve_time_s: number
  fields_final: Record<string, number[] | number[][]>
  probe_data: ProbeResult[]
  dft_results: Record<string, unknown>
}

// ============================================================================
// Preprocessor Request / Response
// ============================================================================

export interface FdtdMeshRequest {
  geometry: FdtdGeometry
}

export interface FdtdMeshResponse {
  nx: number
  ny: number
  nz: number
  dx: number
  dy: number
  dz: number
  total_cells: number
  structures_applied: number
  sources: Record<string, unknown>[]
  boundaries: Record<string, unknown>
  message: string
}

export interface FdtdValidationRequest {
  geometry: FdtdGeometry
  config: Partial<FdtdConfig>
}

export interface FdtdValidationResponse {
  valid: boolean
  warnings: string[]
  errors: string[]
  nx: number
  ny: number
  nz: number
  dt: number
  total_cells: number
}

// ============================================================================
// Postprocessor Request / Response
// ============================================================================

export interface FieldSnapshotRequest {
  field_component: FieldComponent
  field_data: number[] | number[][]
  dx: number
  dy?: number
}

export interface FieldSnapshotResponse {
  field_component: string
  values: number[] | number[][]
  x_coords: number[]
  y_coords: number[]
  min_value: number
  max_value: number
}

export interface PoyntingRequest {
  e_fields: Record<string, number[] | number[][]>
  h_fields: Record<string, number[] | number[][]>
  dx: number
  dy?: number
}

export interface PoyntingResponse {
  sx: number[] | number[][]
  sy: number[] | number[][]
  sz: number[] | number[][]
  magnitude: number[] | number[][]
  total_power: number
}

export interface RadiationPatternResponse {
  angles_deg: number[]
  pattern_db: number[]
  pattern_linear: number[]
  max_directivity_db: number
  beam_width_deg: number | null
}

// ============================================================================
// Default Helpers
// ============================================================================

export const DEFAULT_BOUNDARIES: DomainBoundaries = {
  x_min: { type: 'mur_abc' },
  x_max: { type: 'mur_abc' },
  y_min: { type: 'mur_abc' },
  y_max: { type: 'mur_abc' },
  z_min: { type: 'mur_abc' },
  z_max: { type: 'mur_abc' },
}

export const DEFAULT_CONFIG: FdtdConfig = {
  num_time_steps: 1000,
  courant_number: 0.99,
  output_every_n_steps: 10,
  dft_frequencies: [],
  auto_shutoff_threshold: 1e-6,
}
