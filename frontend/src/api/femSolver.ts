/**
 * FEM Solver API — solve requests.
 */

import { femSolverClient, handleApiResponse } from './client'
import type { FEMMesh } from '@/types/femMesh'
import type { FEMSolverConfig, FEMSolverResult } from '@/types/femSolver'
import type { Material, MaterialAssignment, BoundaryCondition, Excitation, PDEType } from '@/types/femPhysics'

/**
 * Backend-compatible solve request shape.
 * Differs from frontend types:
 * - materials: dict keyed by ID with relative_permittivity
 * - boundary_conditions: uses boundary_name (mesh region name) instead of edgeIds
 * - config: maps frontend field names to backend FEMSolverConfig
 */
interface BackendSolveRequest {
  mesh: Record<string, unknown>
  pde_type: PDEType
  materials: Record<string, { id: string; name: string; relative_permittivity?: number; conductivity?: number }>
  boundary_conditions: { bc_type: string; boundary_name: string; value: number | string }[]
  excitations: { region_name: string; excitation_type: string; value: number | string }[]
  config: {
    pde_type: PDEType
    analysis_type: string
    solver_type: string
    tolerance: number
    max_iterations: number
  }
}

/** Convert frontend FEMMesh to backend snake_case format with material assignments applied. */
function toBackendMesh(
  mesh: FEMMesh,
  materialAssignments: MaterialAssignment[],
): Record<string, unknown> {
  // Build bodyId → materialId lookup from assignments
  const assignmentMap = new Map<string, string>()
  for (const a of materialAssignments) {
    assignmentMap.set(a.bodyId, a.materialId)
  }

  return {
    nodes: mesh.nodes.map((n) => ({ id: n.id, coords: n.coords })),
    elements: mesh.elements.map((e) => ({
      id: e.id,
      element_type: e.elementType,
      node_ids: e.nodeIds,
      region_id: e.regionId,
    })),
    regions: mesh.regions.map((r) => ({
      id: r.id,
      name: r.name,
      // Match region name to materialAssignment bodyId to set material_id
      material_id: assignmentMap.get(r.name) ?? r.materialId ?? null,
    })),
    boundary_edges: mesh.boundaryEdges.map((b) => ({
      id: b.id,
      node_ids: b.nodeIds,
      region_name: b.regionName,
    })),
    element_type: mesh.elementType,
    dimension: mesh.dimension,
    metadata: mesh.metadata,
  }
}

/** Convert frontend materials to backend dict format.
 *  For electrostatic: sends relative_permittivity.
 *  For current_flow: sends conductivity.
 */
function toBackendMaterials(
  materials: Material[],
  pdeType: PDEType = 'electrostatic',
): BackendSolveRequest['materials'] {
  const result: BackendSolveRequest['materials'] = {}
  for (const mat of materials) {
    if (pdeType === 'current_flow') {
      const sigmaProp = mat.properties.find(
        (p) => p.name === 'sigma' || p.name === 'conductivity',
      )
      const sigma = sigmaProp ? Number(sigmaProp.value) : 1.0
      result[mat.id] = { id: mat.id, name: mat.name, conductivity: sigma }
    } else {
      const epsProp = mat.properties.find(
        (p) => p.name === 'relative_permittivity' || p.name === 'Relative Permittivity',
      )
      const epsR = epsProp ? Number(epsProp.value) : 1.0
      result[mat.id] = { id: mat.id, name: mat.name, relative_permittivity: epsR }
    }
  }
  return result
}

/** Convert frontend BCs to backend format using geometry edge IDs as boundary_name. */
function toBackendBCs(
  boundaryConditions: BoundaryCondition[],
): BackendSolveRequest['boundary_conditions'] {
  const result: BackendSolveRequest['boundary_conditions'] = []
  for (const bc of boundaryConditions) {
    // Each edge ID in the BC maps to a boundary region name in the mesh
    for (const edgeId of bc.edgeIds) {
      result.push({
        bc_type: bc.type,
        boundary_name: edgeId,
        value: bc.value,
      })
    }
  }
  return result
}

/** Convert frontend excitations to backend format. */
function toBackendExcitations(
  excitations: Excitation[],
): BackendSolveRequest['excitations'] {
  const result: BackendSolveRequest['excitations'] = []
  for (const exc of excitations) {
    for (const bodyId of exc.bodyIds) {
      result.push({
        region_name: bodyId,
        excitation_type: exc.type,
        value: exc.value,
      })
    }
  }
  return result
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
): Promise<FEMSolverResult> {
  const request: BackendSolveRequest = {
    mesh: toBackendMesh(mesh, materialAssignments),
    pde_type: pdeType,
    materials: toBackendMaterials(materials, pdeType),
    boundary_conditions: toBackendBCs(boundaryConditions),
    excitations: toBackendExcitations(excitations),
    config: {
      pde_type: pdeType,
      analysis_type: config.analysisType,
      solver_type: config.linearSolver,
      tolerance: config.tolerance,
      max_iterations: config.maxIterations,
    },
  }
  const response = await femSolverClient.post('/api/fem/solve', request)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = handleApiResponse<any>(response)
  return toFrontendResult(raw)
}

/** Transform backend snake_case result to frontend camelCase FEMSolverResult. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFrontendResult(raw: any): FEMSolverResult {
  const scalarFields: FEMSolverResult['scalarFields'] = []
  const sf = raw.scalar_fields ?? raw.scalarFields ?? {}
  for (const [, v] of Object.entries(sf)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const field = v as any
    scalarFields.push({
      name: field.field_name ?? field.name,
      values: field.node_values ?? field.values ?? [],
      elementValues: field.element_values ?? field.elementValues ?? [],
      unit: field.unit ?? '',
      min: field.min_value ?? field.min ?? 0,
      max: field.max_value ?? field.max ?? 0,
    })
  }

  const vectorFields: FEMSolverResult['vectorFields'] = []
  const vf = raw.vector_fields ?? raw.vectorFields ?? {}
  for (const [, v] of Object.entries(vf)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const field = v as any
    vectorFields.push({
      name: field.field_name ?? field.name,
      values: field.element_values ?? field.values ?? [],
      unit: field.unit ?? '',
      maxMagnitude: field.max_magnitude ?? field.maxMagnitude ?? 0,
    })
  }

  const integralQuantities: FEMSolverResult['integralQuantities'] = (
    raw.integrals ?? raw.integralQuantities ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).map((iq: any) => ({
    name: iq.name,
    value: iq.value,
    unit: iq.unit ?? '',
  }))

  return {
    scalarFields,
    vectorFields,
    integralQuantities,
    solveTimeMs: (raw.solve_time ?? raw.solveTimeMs ?? 0) * 1000,
    nDofs: raw.n_dofs ?? raw.nDofs ?? 0,
  }
}
