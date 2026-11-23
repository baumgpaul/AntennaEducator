import { describe, expect, it, vi } from 'vitest';
import type { SolveResult } from '../api';
import { EPSILON_0, TEMPLATES, type FemModel } from '../model';
import { buildFemReport, pdfText } from '../results/femReport';
import { potentialImage } from '../results/fieldImage';

const RESULT = {
  mesh: {
    nodes: [-1, -1, 1, -1, 1, 1, -1, 1],
    triangles: [0, 1, 2, 0, 2, 3],
    triangle_domain: [0, 1],
    domain_names: ['air', 'dielectric'],
    edges: [0, 1, 1, 2, 2, 3, 3, 0],
    boundaries: {},
    quality: [0.8, 0.8],
    stats: { nodes: 4, triangles: 2, domains: {}, boundaries: {}, quality: { min: 0.8, mean: 0.8, histogram: [], bin_edges: [] } },
  },
  potential: [0, 0, 1, 1],
  electric_field: [0, -0.5, 0, -0.5],
  flux_density: [0, -0.5 * EPSILON_0, 0, -2.2 * EPSILON_0],
  permittivity: { air: EPSILON_0, dielectric: 4.4 * EPSILON_0 },
  capacitance: { from_charge: 1.08e-10, from_energy: 1.08e-10, voltage: 1 },
  charge: { top: 1.08e-10, bottom: -1.08e-10 },
  charge_from_flux: { top: 1.07e-10, bottom: -1.07e-10 },
  energy: 5.4e-11,
  energy_by_domain: { air: 0.4e-11, dielectric: 5e-11 },
  depth: 1,
} as unknown as SolveResult;
const plate = TEMPLATES.find((t) => t.id === 'plate-capacitor')!.model;
const model: FemModel = {
  ...plate,
  views: [
    { id: 's', name: 'Gap sweep', type: 'sweep', quantity: 'capacitance', parameter: 'd', from: 0.002, to: 0.004, steps: 2, run: { key: 'k', points: [{ x: 0.002, nodes: 900, value: 8e-10 }], reference: [7.8e-10] } },
  ],
};

/** The text drawn on the pages (jsPDF writes uncompressed "(…) Tj" operators by default). */
const pdfStrings = (raw: string) =>
  [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')).join('\n');

describe('FEM PDF report', () => {
  it('spells out characters the PDF base fonts cannot print', () => {
    expect(pdfText('εr, 2W/ΔV², ∮ D·n, uᵀKu')).toBe('epsr, 2W/Delta V², surface integral of D·n, u^TKu');
  });

  it('has the model, the results and the studies; every page has the footer', () => {
    const doc = buildFemReport({ model, projectName: 'My capacitor', result: { data: RESULT, current: true } });
    const raw = doc.output();
    const text = pdfStrings(raw);
    for (const heading of ['Model', 'Parameters', 'Geometry', 'Materials', 'Mesh', 'Results', 'Capacitance (per metre)', 'Charge on each electrode', 'Studies', 'Gap sweep (d from 0.002 to 0.004)']) {
      expect(text).toContain(heading);
    }
    expect(text).toContain('Parallel plates without fringing, epsA/d');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(text.match(/Antenna Educator/g)!.length).toBe(doc.getNumberOfPages());
    // nothing outside Latin-1 reaches the text operators
    expect([...text].every((c) => c.charCodeAt(0) < 256)).toBe(true);
  });

  it('says when the results are out of date, and when there are none', () => {
    const stale = pdfStrings(buildFemReport({ model, projectName: 'p', result: { data: RESULT, current: false } }).output());
    expect(stale).toContain('belong to an earlier version');
    const none = pdfStrings(buildFemReport({ model: { ...model, views: [] }, projectName: 'p' }).output());
    expect(none).toContain('Not solved yet.');
    expect(none).not.toContain('Studies');
  });
});

describe('potential picture', () => {
  function fakeCanvas(withContext = true) {
    const ctx = {
      fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), fillStyle: '', strokeStyle: '', lineWidth: 1,
    };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => (withContext ? ctx : null)), toDataURL: vi.fn(() => 'data:image/jpeg;base64,AAAA') };
    return { canvas, ctx };
  }

  it('one filled triangle per element, the boundary edges on top, and the value range', () => {
    const { canvas, ctx } = fakeCanvas();
    const img = potentialImage(RESULT, { width: 400, makeCanvas: () => canvas as unknown as HTMLCanvasElement });
    expect(img).toEqual({ dataUrl: 'data:image/jpeg;base64,AAAA', aspect: 1, min: 0, max: 1 });
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
    expect(canvas.height).toBe(400);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.moveTo).toHaveBeenCalledTimes(2 + 4); // 2 triangles + 4 boundary edges
  });

  it('no 2D canvas: no picture (the report goes without it)', () => {
    const { canvas } = fakeCanvas(false);
    expect(potentialImage(RESULT, { makeCanvas: () => canvas as unknown as HTMLCanvasElement })).toBeNull();
  });
});
