import { describe, expect, it } from 'vitest';
import type { AntennaElement } from '@/types/models';
import type { MeshSnapshot, ParameterStudyResult } from '@/types/parameterStudy';
import type { ViewItem } from '@/types/postprocessing';
import { computeAutoRange } from '../design/PostprocessingTab';
import { overlaySweepSnapshots, solutionValuesAt } from './sweepPointData';

const el = (id: string, extra: Partial<AntennaElement> = {}): AntennaElement => ({
  id,
  type: 'dipole',
  name: id,
  config: {} as AntennaElement['config'],
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  mesh: { nodes: [[0, 0, -0.25], [0, 0, 0.25]], edges: [[1, 2]], radii: [0.001] },
  visible: true,
  locked: false,
  ...extra,
});

const snap = (elementId: string | undefined, half: number): MeshSnapshot => ({
  elementId,
  nodes: [[0, 0, -half], [0, 0, 0], [0, 0, half]],
  edges: [[1, 2], [2, 3]],
  radii: [0.001, 0.001],
  position: [0, 0, 0.1],
});

/** Two sweep points; point 1 has 10× the current of the nominal solve */
const study = {
  config: { sweepVariables: [] },
  gridPoints: [],
  results: [
    { point: { values: {} }, converged: true, solverResponse: { antenna_solutions: [{ branch_currents: [0.01, 0.02], node_voltages: [1, 2, 3] }] } },
    { point: { values: {} }, converged: true, solverResponse: { antenna_solutions: [{ branch_currents: [0.1, 0.3], node_voltages: [4, 5, 6] }] } },
  ],
} as unknown as ParameterStudyResult;
const nominal = { branch_currents: [0.02, 0.03], node_voltages: [7, 8] };

describe('overlaySweepSnapshots', () => {
  it('replaces mesh and position by element id without touching the design', () => {
    const design = [el('a'), el('b')];
    const shown = overlaySweepSnapshots(design, [snap('b', 0.4)]);
    expect(shown[0]).toBe(design[0]);
    expect(shown[1].mesh.nodes).toHaveLength(3);
    expect(shown[1].mesh.edges).toEqual([[1, 2], [2, 3]]);
    expect(shown[1].position).toEqual([0, 0, 0.1]);
    expect(design[1].mesh.nodes).toHaveLength(2); // input untouched
  });

  it('maps id-less (old) snapshots onto the visible unlocked elements in order', () => {
    const design = [el('a', { visible: false }), el('b'), el('c', { locked: true }), el('d')];
    const shown = overlaySweepSnapshots(design, [snap(undefined, 0.3), snap(undefined, 0.6)]);
    expect(shown.map((e) => e.mesh.nodes.length)).toEqual([2, 3, 2, 3]);
    expect(shown[3].mesh.nodes[2]).toEqual([0, 0, 0.6]);
  });

  it('returns the design itself without snapshots', () => {
    const design = [el('a')];
    expect(overlaySweepSnapshots(design, undefined)).toBe(design);
  });
});

describe('solutionValuesAt', () => {
  it('parameter sweep: values of the selected point', () => {
    const v = solutionValuesAt(1, 'branch_currents', { results: nominal, frequencySweep: null, parameterStudy: study });
    expect(v).toEqual([0.1, 0.3]);
  });

  it('single solve: the nominal results', () => {
    const v = solutionValuesAt(3e8, 'node_voltages', { results: nominal, frequencySweep: null, parameterStudy: null });
    expect(v).toEqual([7, 8]);
  });

  it('frequency sweep: the result at that frequency', () => {
    const frequencySweep = {
      frequencies: [2e8, 3e8],
      results: [{ antenna_solutions: [{ branch_currents: [1] }] }, { antenna_solutions: [{ branch_currents: [2] }] }],
    };
    expect(solutionValuesAt(3e8, 'branch_currents', { results: nominal, frequencySweep, parameterStudy: null })).toEqual([2]);
  });
});

describe('colour scale in sweep mode', () => {
  const item = { id: 'c', type: 'current', visible: true, label: 'Current' } as ViewItem;

  it('follows the selected sweep point, not the nominal solve', () => {
    const range = computeAutoRange(item, nominal as never, null, null, 1, null, { frequencySweep: null, parameterStudy: study });
    expect(range).toEqual({ min: 0.1, max: 0.3 });
  });

  it('still uses the nominal solve without a sweep', () => {
    const range = computeAutoRange(item, nominal as never, null, null, null);
    expect(range).toEqual({ min: 0.02, max: 0.03 });
  });
});
