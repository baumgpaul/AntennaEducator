/**
 * The FEM workflow as tabs. Each step explains what it means for the method
 * ("Learn" panel) — the studio is meant to teach how FEM works, not to hide it.
 */

export type FemStepId = 'geometry' | 'materials' | 'physics' | 'mesh' | 'solve' | 'results';

/** done: complete · attention: something to fix · todo: not started · locked: needs earlier steps */
export type FemStepStatus = 'done' | 'attention' | 'todo' | 'locked';

export interface FemStep {
  id: FemStepId;
  label: string;
  /** What this step is, in one line */
  summary: string;
  /** What it means for the finite element method */
  learn: string[];
  /** Steps that must be done before this one can start */
  requires: FemStepId[];
}

export const FEM_STEPS: FemStep[] = [
  {
    id: 'geometry',
    label: 'Geometry',
    summary: 'Draw the domains: conductors, dielectrics and the surrounding air.',
    learn: [
      'FEM solves a partial differential equation on a bounded region Ω. Everything the field can reach must be inside it — including the air around the objects.',
      'The geometry splits Ω into domains (areas with one material) and boundaries (where conditions are imposed). Name them: materials and conditions attach to these named selections, so they survive later edits.',
    ],
    requires: [],
  },
  {
    id: 'materials',
    label: 'Materials',
    summary: 'Assign a material to every domain.',
    learn: [
      'Material properties are the coefficients of the equation, e.g. the permittivity ε in −∇·(ε∇V) = ρ.',
      'Inside one domain the coefficient is constant; across an interface it jumps. FEM handles that naturally: the normal flux ε ∂V/∂n stays continuous without any extra condition.',
    ],
    requires: ['geometry'],
  },
  {
    id: 'physics',
    label: 'Physics',
    summary: 'Choose the physics and set boundary conditions and sources.',
    learn: [
      'Dirichlet conditions fix the unknown (a potential on an electrode). Neumann conditions fix its flux; the "natural" condition ∂V/∂n = 0 needs no input at all — it is what FEM imposes on any boundary you leave untouched.',
      'Without at least one Dirichlet condition the electrostatic potential is only defined up to a constant: the system matrix is singular.',
    ],
    requires: ['materials'],
  },
  {
    id: 'mesh',
    label: 'Mesh',
    summary: 'Split the domains into triangles (elements).',
    learn: [
      'The solution is approximated by simple functions on each element, e.g. linear on a triangle (P1). The unknowns are the values at the mesh nodes.',
      'Smaller elements give a better approximation — where the field changes quickly (sharp corners, thin gaps) the mesh must be fine. Badly shaped (very flat) triangles spoil the accuracy.',
    ],
    requires: ['physics'],
  },
  {
    id: 'solve',
    label: 'Solve',
    summary: 'Assemble and solve the linear system K·u = f.',
    learn: [
      'Each element contributes a small matrix (for P1 triangles 3×3); assembly adds them into one global matrix K at the rows and columns of the element’s nodes.',
      'K is sparse — a node only couples to its neighbours — and symmetric positive definite for electrostatics, so large systems are solved efficiently.',
    ],
    requires: ['mesh'],
  },
  {
    id: 'results',
    label: 'Results',
    summary: 'Explore fields and quantities, and check their accuracy.',
    learn: [
      'The potential is continuous, but its gradient E = −∇V is constant per P1 element: fields are one order less accurate than the potential.',
      'Integral quantities (charge, capacitance, energy) are often far more accurate than local fields. Refine the mesh and watch them converge — that is how you know a result can be trusted.',
    ],
    requires: ['solve'],
  },
];

/**
 * Status of every step from the steps completed so far and those needing
 * attention. A step is locked until all of its prerequisites are done.
 */
export function stepStatuses(
  done: ReadonlySet<FemStepId>,
  attention: ReadonlySet<FemStepId> = new Set(),
): Record<FemStepId, FemStepStatus> {
  const result = {} as Record<FemStepId, FemStepStatus>;
  for (const step of FEM_STEPS) {
    if (!step.requires.every((r) => done.has(r))) result[step.id] = 'locked';
    else if (attention.has(step.id)) result[step.id] = 'attention';
    else result[step.id] = done.has(step.id) ? 'done' : 'todo';
  }
  return result;
}

/** The first step that still needs work (where "Next" leads), or null when all are done. */
export function nextStep(statuses: Record<FemStepId, FemStepStatus>): FemStepId | null {
  return FEM_STEPS.find((s) => statuses[s.id] !== 'done')?.id ?? null;
}
