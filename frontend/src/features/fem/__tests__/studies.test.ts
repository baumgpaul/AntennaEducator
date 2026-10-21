import { describe, it, expect, vi } from 'vitest';
import type { SolveSummary } from '../api';
import { evaluate, evaluateParameters } from '../expressions';
import { EPSILON_0, TEMPLATES, type FemModel, type FemView } from '../model';
import {
  analyticValue,
  convergence,
  convergenceFactors,
  logSlope,
  runStudy,
  scaleMesh,
  studyModels,
  sweepValues,
  valueOf,
} from '../results/studies';
import { newView } from '../results/views';

const coax = TEMPLATES.find((t) => t.id === 'coax')!.model;
const plate = TEMPLATES.find((t) => t.id === 'plate-capacitor')!.model;
const sizeOf = (m: FemModel) => evaluate(m.mesh.size, evaluateParameters(m.parameters));
const summary = (value: number, nodes = 100): SolveSummary => ({
  warnings: [],
  nodes,
  triangles: 2 * nodes,
  energy: value / 2,
  energy_by_domain: {},
  charge: {},
  capacitance: { from_charge: value, from_energy: value, voltage: 1 },
  seconds: 0.01,
});

describe('mesh refinement', () => {
  it('goes from twice the model size down by √2 per step', () => {
    expect(convergenceFactors(5)).toEqual([2, 1.41421, 1, 0.707107, 0.5]);
  });

  it('scales every element size and refines curved edges with it', () => {
    const fine = scaleMesh(plate, 0.5);
    expect(sizeOf(fine)).toBeCloseTo(sizeOf(plate) / 2, 15);
    const p = evaluateParameters(plate.parameters);
    expect(evaluate(fine.mesh.boundary_sizes.top, p)).toBeCloseTo(evaluate(plate.mesh.boundary_sizes.top, p) / 2, 15);
    expect(fine.mesh.elements_per_circle).toBe(2 * plate.mesh.elements_per_circle);
    expect(scaleMesh(coax, 1).mesh.elements_per_circle).toBe(coax.mesh.elements_per_circle);
    expect(scaleMesh({ ...coax, mesh: { ...coax.mesh, elements_per_circle: 4 } }, 4).mesh.elements_per_circle).toBe(4);
  });
});

describe('parameter sweep', () => {
  const sweep = (from: string | number, to: string | number, steps: number): Extract<FemView, { type: 'sweep' }> => ({
    id: 's',
    name: 's',
    type: 'sweep',
    quantity: 'capacitance',
    parameter: 'd',
    from,
    to,
    steps,
  });

  it('spaces the values evenly, ends included, also from expressions', () => {
    expect(sweepValues(sweep(0.001, 0.004, 4), plate)).toEqual([0.001, 0.002, 0.003, 0.004]);
    expect(sweepValues(sweep('d/2', 'd', 2), plate)).toEqual([0.002, 0.004]);
  });

  it('solves one model per value, and refuses an unknown parameter', () => {
    const items = studyModels(sweep(0.002, 0.004, 3), plate);
    expect(items.map((i) => i.model.parameters.d)).toEqual([0.002, 0.003, 0.004]);
    expect(() => studyModels({ ...sweep(1, 2, 2), parameter: 'nope' }, plate)).toThrow(/no parameter "nope"/);
  });

  it('the textbook value follows the parameter: εA/d halves when d doubles', () => {
    const [a, b] = studyModels(sweep('d', '2*d', 2), plate).map((i) => analyticValue(i.model, 'capacitance')!);
    expect(a / b).toBeCloseTo(2, 12);
    const p = evaluateParameters(plate.parameters);
    expect(a).toBeCloseTo((EPSILON_0 * 4.4 * p.w) / p.d, 20);
    expect(analyticValue(plate, 'energy')).toBeNull();
    expect(analyticValue({ ...plate, template: undefined }, 'capacitance')).toBeNull();
  });

  it('a new sweep varies the first parameter around its value', () => {
    const v = newView('sweep', [], [], { model: plate });
    expect(v).toMatchObject({ parameter: 'w', from: 0.02, to: 0.06, quantity: 'capacitance' });
    expect(newView('convergence', [], [], { capacitance: false })).toMatchObject({ quantity: 'energy', steps: 5 });
  });
});

describe('running a study', () => {
  const items = [1, 2, 3].map((x) => ({ x, model: coax }));

  it('records each point and reports progress', async () => {
    const progress = vi.fn();
    const solve = vi.fn(async () => summary(5));
    const points = await runStudy(items, 'capacitance', solve, progress);
    expect(points.map((p) => [p.x, p.value, p.nodes])).toEqual([
      [1, 5, 100],
      [2, 5, 100],
      [3, 5, 100],
    ]);
    expect(progress).toHaveBeenCalledTimes(3);
    expect(await runStudy(items.slice(0, 1), 'energy', solve, () => {})).toMatchObject([{ value: 2.5 }]);
  });

  it('keeps going past a failing point, and says why it failed', async () => {
    const solve = vi
      .fn()
      .mockResolvedValueOnce(summary(1))
      .mockRejectedValueOnce(new Error('The mesh would exceed 200,000 triangles'))
      .mockResolvedValueOnce(summary(2));
    const points = await runStudy(items, 'capacitance', solve, () => {});
    expect(points[1]).toEqual({ x: 2, error: 'The mesh would exceed 200,000 triangles' });
    expect(points[2].value).toBe(2);
  });

  it('cancelling keeps the points done so far', async () => {
    const ctrl = new AbortController();
    const solve = vi.fn(async () => {
      ctrl.abort();
      return summary(7);
    });
    const points = await runStudy(items, 'capacitance', solve, () => {}, ctrl.signal);
    expect(points).toHaveLength(1);
    expect(solve).toHaveBeenCalledTimes(1);
  });

  it('a model without two electrodes has no capacitance', () => {
    expect(() => valueOf({ ...summary(1), capacitance: null }, 'capacitance')).toThrow(/grounded/);
  });
});

describe('convergence order', () => {
  it('the log-log slope of a power law is its exponent', () => {
    const xs = [10, 100, 1000];
    expect(logSlope(xs, xs.map((x) => 3 * x ** -1.5))).toBeCloseTo(-1.5, 12);
    expect(logSlope([1], [1])).toBeNull();
  });

  it('error ∝ h² (∝ 1/N in 2D) against the textbook value is order 2', () => {
    const exact = 1e-10;
    const points = [400, 800, 1600, 3200].map((n, i) => ({ x: i, nodes: n, value: exact * (1 + 0.5 / n) }));
    const c = convergence(points, exact);
    expect(c.against).toBe('analytic');
    expect(c.errors[0]).toBeCloseTo(0.5 / 400, 15);
    expect(c.orderH).toBeCloseTo(2, 6);
  });

  it('without a textbook value the finest mesh is the reference (and has no error itself)', () => {
    const points = [
      { x: 2, nodes: 100, value: 1.04 },
      { x: 1, nodes: 400, value: 1.01 },
      { x: 0.5, nodes: 1600, value: 1.0 },
      { x: 0.25, error: 'too fine' },
    ];
    const c = convergence(points, null);
    expect(c.against).toBe('finest');
    expect(c.errors[2]).toBeNull();
    expect(c.errors[3]).toBeNull();
    expect(c.errors[0]).toBeCloseTo(0.04, 12);
    expect(c.orderH).toBeCloseTo(2, 6);
  });
});
