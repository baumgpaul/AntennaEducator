/**
 * FEM physics types — materials, boundary conditions, excitations.
 */

export type PDEType = 'electrostatic' | 'current_flow' | 'magnetostatic' | 'eddy_current'

export type BCType = 'dirichlet' | 'neumann' | 'robin' | 'periodic'

// ── Materials ─────────────────────────────────────────────────

export interface MaterialProperty {
  name: string
  value: number | string
  unit: string
}

export interface Material {
  id: string
  name: string
  properties: MaterialProperty[]
}

export interface MaterialAssignment {
  bodyId: string
  materialId: string
}

// ── Boundary conditions ───────────────────────────────────────

export interface BoundaryCondition {
  id: string
  name: string
  type: BCType
  value: number | string
  edgeIds: string[]
}

export interface BCAssignment {
  edgeId: string
  bcId: string
}

// ── Excitations ───────────────────────────────────────────────

export interface Excitation {
  id: string
  name: string
  type: 'volume_source'
  value: number | string
  bodyIds: string[]
}

// ── Built-in material library ─────────────────────────────────

export interface LibraryMaterial {
  id: string
  name: string
  category: string
  properties: MaterialProperty[]
}

export const BUILTIN_MATERIALS: LibraryMaterial[] = [
  {
    id: 'vacuum',
    name: 'Vacuum',
    category: 'General',
    properties: [{ name: 'epsilon_r', value: 1.0, unit: '' }],
  },
  {
    id: 'air',
    name: 'Air',
    category: 'General',
    properties: [{ name: 'epsilon_r', value: 1.00059, unit: '' }],
  },
  {
    id: 'fr4',
    name: 'FR-4',
    category: 'Dielectric',
    properties: [{ name: 'epsilon_r', value: 4.4, unit: '' }],
  },
  {
    id: 'copper',
    name: 'Copper',
    category: 'Metal',
    properties: [
      { name: 'sigma', value: 5.8e7, unit: 'S/m' },
      { name: 'epsilon_r', value: 1.0, unit: '' },
    ],
  },
  {
    id: 'aluminium',
    name: 'Aluminium',
    category: 'Metal',
    properties: [
      { name: 'sigma', value: 3.77e7, unit: 'S/m' },
      { name: 'epsilon_r', value: 1.0, unit: '' },
    ],
  },
]
