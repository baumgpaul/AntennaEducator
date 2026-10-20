import { describe, it, expect } from 'vitest';
import type { SolveResult } from '../api';
import { evaluateParameters } from '../expressions';
import { sampleLine } from '../lineProbe';
import { EMPTY_MODEL, TEMPLATES } from '../model';
import { defaultViews, lineEnds, newView } from '../results/views';

// Unit square of two triangles carrying the linear field V = 2x + 3y (E = −∇V = (−2, −3))
const linearResult = () => {
  const nodes = [0, 0, 1, 0, 1, 1, 0, 1];
  const V = (x: number, y: number) => 2 * x + 3 * y;
  return {
    mesh: { nodes, triangles: [0, 1, 2, 0, 2, 3], triangle_domain: [0, 0], domain_names: ['d'], edges: [], boundaries: {} },
    potential: [0, 1, 2, 3].map((i) => V(nodes[2 * i], nodes[2 * i + 1])),
    electric_field: [-2, -3, -2, -3],
  } as unknown as SolveResult;
};

describe('line probe', () => {
  it('reproduces a linear potential exactly (P1 interpolation)', () => {
    const s = sampleLine(linearResult(), [0.1, 0.2], [0.9, 0.7], 'potential', 25);
    expect(s).toHaveLength(25);
    expect(s[0].s).toBe(0);
    expect(s[24].s).toBeCloseTo(Math.hypot(0.8, 0.5), 12);
    s.forEach((p) => expect(p.value).toBeCloseTo(2 * p.x + 3 * p.y, 10));
  });

  it('|E| is the element value, √13 here (stored in single precision)', () => {
    sampleLine(linearResult(), [0.05, 0.5], [0.95, 0.5], 'E', 10).forEach((p) =>
      expect(p.value).toBeCloseTo(Math.sqrt(13), 6),
    );
  });

  it('is null outside the mesh', () => {
    const s = sampleLine(linearResult(), [0.5, 0.5], [1.5, 0.5], 'potential', 11);
    expect(s[0].value).not.toBeNull();
    expect(s[10].value).toBeNull();
  });
});

describe('analytic field of the templates', () => {
  const at = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)!;
    return { f: t.fieldAt!, p: evaluateParameters(t.model.parameters) };
  };

  it('coax: V meets the electrode potentials, E = −dV/dr, ∇²V = 0', () => {
    const { f, p } = at('coax');
    expect(f.value(p.a, 0, p)!.V).toBeCloseTo(p.U, 12);
    expect(f.value(0, p.b, p)!.V).toBeCloseTo(0, 12);
    expect(f.value(p.a / 2, 0, p)).toBeNull();
    const r = (p.a + p.b) / 2;
    const h = 1e-7;
    const V = (x: number, y: number) => f.value(x, y, p)!.V;
    expect(-(V(r + h, 0) - V(r - h, 0)) / (2 * h) / f.value(r, 0, p)!.E).toBeCloseTo(1, 6);
    const x = r * 0.6;
    const y = r * 0.8;
    const k = 1e-5;
    const laplacian = (V(x + k, y) + V(x - k, y) + V(x, y + k) + V(x, y - k) - 4 * V(x, y)) / (k * k);
    expect(Math.abs(laplacian) / (f.value(x, y, p)!.E / r)).toBeLessThan(1e-3);
  });

  it('plate capacitor: linear from the grounded bottom to U at the top', () => {
    const { f, p } = at('plate-capacitor');
    expect(f.value(0, -p.d / 2, p)!.V).toBeCloseTo(0, 12);
    expect(f.value(0, p.d / 2, p)!.V).toBeCloseTo(p.U, 12);
    expect(f.value(0, 0, p)!.E).toBeCloseTo(p.U / p.d, 9);
    expect(f.value(p.w, 0, p)).toBeNull();
  });
});

describe('result views', () => {
  it('templates start with a field, the quantities and a probe across the dielectric', () => {
    for (const t of TEMPLATES) {
      const views = defaultViews(t.model);
      expect(views.map((v) => v.type)).toEqual(['field', 'quantities', 'line']);
      const line = views[2];
      if (line.type !== 'line') throw new Error('line view expected');
      const ends = lineEnds(line, t.model);
      if ('error' in ends) throw new Error(ends.error);
      const mid: [number, number] = [(ends.start[0] + ends.end[0]) / 2, (ends.start[1] + ends.end[1]) / 2];
      expect(t.fieldAt!.value(...mid, evaluateParameters(t.model.parameters))).not.toBeNull();
    }
    expect(defaultViews(EMPTY_MODEL).map((v) => v.type)).toEqual(['field', 'quantities']);
  });

  it('line end points use the parameters; a bad expression is reported', () => {
    const coax = TEMPLATES.find((x) => x.id === 'coax')!.model;
    const line = defaultViews(coax)[2];
    if (line.type !== 'line') throw new Error('line view expected');
    expect(lineEnds(line, coax)).toEqual({ start: [0.0005, 0], end: [0.0017, 0] });
    expect(lineEnds({ ...line, end: ['nope', 0] }, coax)).toHaveProperty('error');
  });

  it('new views get unique ids and numbered names', () => {
    const a = newView('line', []);
    const b = newView('line', [a]);
    expect(a.id).not.toBe(b.id);
    expect([a.name, b.name]).toEqual(['Line probe 1', 'Line probe 2']);
  });

  it('a new line probe crosses the mesh through its middle', () => {
    const v = newView('line', [], [-0.002, -0.001, 0.002, -0.001, 0, 0.003]);
    expect(v).toMatchObject({ start: [-0.002, 0.001], end: [0.002, 0.001] });
  });
});
