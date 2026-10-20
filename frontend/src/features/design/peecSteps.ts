/**
 * The antenna (PEEC) workflow as steps, in the shared workflow shell:
 * Designer → Circuit → Solver → Postprocessing, each with a status and a
 * Learn text on what it means for the method.
 */
import type { WorkflowStep } from '@/features/workflow/steps';

export type PeecStepId = 'designer' | 'circuit' | 'solver' | 'postprocessing';

export const PEEC_STEPS: WorkflowStep<PeecStepId>[] = [
  {
    id: 'designer',
    label: 'Designer',
    summary: 'Build the antenna from wires: dipoles, loops, rods or your own structure.',
    learn: [
      'PEEC (Partial Element Equivalent Circuit) turns the wires into a circuit: every wire is cut into short segments. Each segment becomes a branch with its partial inductance and resistance; each node gets a partial capacitance.',
      'Segments must be short compared to the wavelength — at least about 10 per wavelength, more where the current changes fast. Thin wires: the radius only enters through the partial elements, the wire itself is one-dimensional.',
    ],
    requires: [],
  },
  {
    id: 'circuit',
    label: 'Circuit',
    summary: 'Connect sources, loads and ports to the nodes of the wire mesh.',
    learn: [
      'A voltage source in the feed gap drives the antenna; lumped resistors, inductors and capacitors model matching networks or loading. They are ordinary circuit elements added to the PEEC circuit.',
      'A port marks where input impedance, reflection coefficient S11 and VSWR are measured. At least one source is needed — parasitic elements (reflectors, directors) need none: they are driven by the field of the others.',
    ],
    requires: ['designer'],
  },
  {
    id: 'solver',
    label: 'Solver',
    summary: 'Solve the circuit at one frequency or over a sweep.',
    learn: [
      'At each frequency the circuit is solved for the branch currents and node potentials (modified nodal analysis). Every segment couples to every other one through the field, with a phase delay for the travel time: the system matrix is dense.',
      'That is the big difference to FEM, which discretises the space around the objects and gets a sparse matrix: PEEC only meshes the wires, so it needs few unknowns, but each one talks to all others.',
    ],
    requires: ['circuit'],
  },
  {
    id: 'postprocessing',
    label: 'Postprocessing',
    summary: 'Look at currents, impedance, fields and radiation patterns.',
    learn: [
      'Everything follows from the currents: input impedance at the ports, near fields by adding up the field of each current element, and far-field patterns and directivity from their radiation.',
      'Sweeps show resonance and bandwidth; the Smith chart shows the impedance against frequency at a glance.',
    ],
    requires: ['solver'],
  },
];

export interface PeecSnapshot {
  elements: { sources?: unknown[] | null }[];
  solved: boolean;
  resultsStale: boolean;
  viewCount: number;
}

/** Done steps, and steps needing attention with the reason (shown on the tab). */
export function peecProgress(s: PeecSnapshot) {
  const done = new Set<PeecStepId>();
  const attention = new Set<PeecStepId>();
  const notes: Partial<Record<PeecStepId, string[]>> = {};
  if (s.elements.length > 0) done.add('designer');
  const hasSource = s.elements.some((e) => (e.sources?.length ?? 0) > 0);
  if (done.has('designer')) {
    if (hasSource) done.add('circuit');
    else {
      attention.add('circuit');
      notes.circuit = ['No source yet: nothing drives a current. Add a voltage or current source.'];
    }
  }
  if (done.has('circuit') && s.solved) {
    // Solved results stay viewable when out of date (as before): done, but flagged
    done.add('solver');
    if (s.resultsStale) {
      attention.add('solver');
      notes.solver = ['The design changed after solving: the results are out of date.'];
    }
  }
  if (done.has('solver') && s.viewCount > 0) done.add('postprocessing');
  return { done, attention, notes };
}
