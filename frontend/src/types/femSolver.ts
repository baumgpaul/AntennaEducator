/**
 * FEM solver types — configuration and results.
 */

export type LinearSolverType = 'direct' | 'cg' | 'gmres'
export type AnalysisType = 'static' | 'frequency' | 'transient'

export interface FEMSolverConfig {
  analysisType: AnalysisType
  linearSolver: LinearSolverType
  tolerance: number
  maxIterations: number
  requestedFields: string[]
  requestedIntegrals: string[]
}

export const defaultFEMSolverConfig: FEMSolverConfig = {
  analysisType: 'static',
  linearSolver: 'direct',
  tolerance: 1e-8,
  maxIterations: 1000,
  requestedFields: ['potential', 'e_field'],
  requestedIntegrals: ['energy'],
}

export type SolveStatus = 'idle' | 'solving' | 'done' | 'error'

// ── Results ───────────────────────────────────────────────────

export interface ScalarFieldResult {
  name: string
  values: number[]
  unit: string
  min: number
  max: number
}

export interface VectorFieldResult {
  name: string
  values: [number, number][]
  unit: string
  maxMagnitude: number
}

export interface IntegralQuantity {
  name: string
  value: number
  unit: string
}

export interface FEMSolverResult {
  scalarFields: ScalarFieldResult[]
  vectorFields: VectorFieldResult[]
  integralQuantities: IntegralQuantity[]
  solveTimeMs: number
  nDofs: number
}
