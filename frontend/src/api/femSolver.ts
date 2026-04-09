/**
 * FEM Solver API — solve requests.
 */

import { femSolverClient, handleApiResponse } from './client'
import type { FEMMesh } from '@/types/femMesh'
import type { FEMSolverConfig, FEMSolverResult } from '@/types/femSolver'
import type { Material, MaterialAssignment, BoundaryCondition, Excitation, PDEType } from '@/types/femPhysics'

export interface FEMSolveRequest {
  mesh: FEMMesh
  pde_type: PDEType
  materials: Material[]
  material_assignments: MaterialAssignment[]
  boundary_conditions: BoundaryCondition[]
  excitations: Excitation[]
  solver_config: {
    analysis_type: string
    linear_solver: string
    tolerance: number
    max_iterations: number
    requested_fields: string[]
    requested_integrals: string[]
  }
  variable_context?: Record<string, number>
}

/** Submit a FEM solve request. */
export async function solveFEM(
  mesh: FEMMesh,
  pdeType: PDEType,
  materials: Material[],
  materialAssignments: MaterialAssignment[],
  boundaryConditions: BoundaryCondition[],
  excitations: Excitation[],
  config: FEMSolverConfig,
  variables?: Record<string, number>
): Promise<FEMSolverResult> {
  const request: FEMSolveRequest = {
    mesh,
    pde_type: pdeType,
    materials,
    material_assignments: materialAssignments,
    boundary_conditions: boundaryConditions,
    excitations,
    solver_config: {
      analysis_type: config.analysisType,
      linear_solver: config.linearSolver,
      tolerance: config.tolerance,
      max_iterations: config.maxIterations,
      requested_fields: config.requestedFields,
      requested_integrals: config.requestedIntegrals,
    },
    variable_context: variables,
  }
  const response = await femSolverClient.post('/api/fem/solve', request)
  return handleApiResponse<FEMSolverResult>(response)
}
