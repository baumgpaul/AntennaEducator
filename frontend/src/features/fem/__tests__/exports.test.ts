import { describe, expect, it } from 'vitest';
import type { SolveResult } from '../api';
import { EPSILON_0, TEMPLATES, type FemModel, type FemView } from '../model';
import {
  exportName,
  femVtu,
  lineProbeCsv,
  lineProbeData,
  modelTables,
  resultTables,
  studyCsv,
  studyTables,
} from '../results/exports';
import { convergenceFactors } from '../results/studies';

// Unit square [-1, 1]², two triangles; V = (y + 1)/2 is exact for P1, E = (0, −½)
const RESULT = {
  mesh: {
    nodes: [-1, -1, 1, -1, 1, 1, -1, 1],
    triangles: [0, 1, 2, 0, 2, 3],
    triangle_domain: [0, 1],
    domain_names: ['air', 'dielectric'],
    edges: [],
    boundaries: {},
    quality: [0.8, 0.8],
    stats: { nodes: 4, triangles: 2, domains: {}, boundaries: {}, quality: { min: 0.8, mean: 0.8, histogram: [], bin_edges: [] } },
  },
  potential: [0, 0, 1, 1],
  electric_field: [0, -0.5, 0, -0.5],
  flux_density: [0, -0.5 * 1.0006 * EPSILON_0, 0, -0.5 * 4.4 * EPSILON_0],
  permittivity: { air: 1.0006 * EPSILON_0, dielectric: 4.4 * EPSILON_0 },
  capacitance: { from_charge: 1.08e-10, from_energy: 1.08e-10, voltage: 1 },
  charge: { top: 1.08e-10, bottom: -1.08e-10 },
  charge_from_flux: { top: 1.07e-10, bottom: -1.07e-10 },
  energy: 5.4e-11,
  energy_by_domain: { air: 0.4e-11, dielectric: 5e-11 },
  depth: 1,
} as unknown as SolveResult;

// the plate template with parameters that make its textbook formula exact on the square
const plate = TEMPLATES.find((t) => t.id === 'plate-capacitor')!.model;
const model: FemModel = { ...plate, name: 'Plate capacitor', parameters: { ...plate.parameters, w: 2, d: 2, U: 1 } };

describe('ParaView export (VTU)', () => {
  const xml = femVtu(RESULT);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const array = (name: string) =>
    doc.querySelector(`DataArray[Name="${name}"]`)!.textContent!.trim().split(/\s+/).map(Number);

  it('is well-formed VTK XML with triangles in the plane z = 0', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const piece = doc.querySelector('Piece')!;
    expect(piece.getAttribute('NumberOfPoints')).toBe('4');
    expect(piece.getAttribute('NumberOfCells')).toBe('2');
    expect(array('Points')).toEqual([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    expect(array('connectivity')).toEqual([0, 1, 2, 0, 2, 3]);
    expect(array('offsets')).toEqual([3, 6]);
    expect(array('types')).toEqual([5, 5]); // VTK_TRIANGLE
  });

  it('carries V per node; E, D, |E|, domain and εr per element', () => {
    expect(array('V')).toEqual([0, 0, 1, 1]);
    expect(array('E')).toEqual([0, -0.5, 0, 0, -0.5, 0]);
    expect(array('D')[4] / EPSILON_0).toBeCloseTo(-0.5 * 4.4, 12);
    expect(array('E_magnitude')).toEqual([0.5, 0.5]);
    expect(array('domain')).toEqual([0, 1]);
    expect(array('eps_r').map((v) => Number(v.toFixed(6)))).toEqual([1.0006, 4.4]);
    expect(xml).toContain('0=air, 1=dielectric');
  });
});

describe('line probe export (CSV)', () => {
  const view: Extract<FemView, { type: 'line' }> = { id: 'l', name: 'Across the gap', type: 'line', quantity: 'potential', start: [0, -0.9], end: [0, 0.9] };

  it('FEM equals the textbook value where the potential is linear', () => {
    const data = lineProbeData(view, RESULT, model);
    if ('error' in data) throw new Error(data.error);
    expect(data.label).toMatch(/no fringing/i);
    for (const s of data.samples) {
      expect(s.fem).toBeCloseTo((s.y + 1) / 2, 12);
      expect(s.analytic).toBeCloseTo((s.y + 1) / 2, 12);
    }
  });

  it('one row per sample with distance, position, FEM and textbook columns', () => {
    const lines = lineProbeCsv(view, RESULT, model).trim().split('\n');
    expect(lines[0]).toBe('s [m],x [m],y [m],V [V] FEM,V [V] Ideal plates (no fringing)');
    expect(lines).toHaveLength(201);
    const [s, x, y, fem] = lines[1].split(',').map(Number);
    expect([s, x, y]).toEqual([0, 0, -0.9]);
    expect(fem).toBeCloseTo(0.05, 12);
  });

  it('refuses a line whose end points do not evaluate', () => {
    expect(() => lineProbeCsv({ ...view, end: ['nope', 0] }, RESULT, model)).toThrow(/Line end points/);
  });
});

describe('study export (CSV)', () => {
  const cInf = 1.08e-10;
  const points = convergenceFactors(5).map((h) => ({ x: h, nodes: Math.round(400 / h ** 2), value: cInf * (1 + 0.05 * h ** 2), seconds: 0.1 }));

  it('convergence: error against the extrapolated value, reference in the last row', () => {
    const view = { id: 'c', name: 'Convergence', type: 'convergence' as const, quantity: 'capacitance' as const, steps: 5, run: { key: 'k', points } };
    const rows = studyCsv(view, model).trim().split('\n').map((r) => r.split(','));
    expect(rows[0][3]).toBe('relative error (against extrapolated)');
    expect(rows).toHaveLength(7);
    expect(Number(rows[5][3])).toBeCloseTo(0.05 * 0.5 ** 2, 8);
    expect(rows[6][0]).toBe('reference (extrapolated)');
    expect(Number(rows[6][2]) / cInf).toBeCloseTo(1, 9);
  });

  it('sweep: parameter, value and textbook value; failed points keep their message', () => {
    const view = {
      id: 's', name: 'Sweep d', type: 'sweep' as const, quantity: 'capacitance' as const, parameter: 'd', from: 1, to: 2, steps: 2,
      run: { key: 'k', points: [{ x: 1, nodes: 100, value: 2e-10 }, { x: 2, error: 'too fine, with "quotes"' }], reference: [1.9e-10, null] },
    };
    const lines = studyCsv(view, model).trim().split('\n');
    expect(lines[0]).toBe('d,nodes,capacitance [F],textbook [F],seconds,error message');
    expect(lines[1]).toBe('1,100,2e-10,1.9e-10,,');
    expect(lines[2]).toBe('2,,,,,"too fine, with ""quotes"""');
  });
});

describe('PDF report tables', () => {
  it('describe the model: evaluated parameters, holes, materials, conditions, mesh', () => {
    const tables = modelTables(model, RESULT);
    const byTitle = Object.fromEntries(tables.map((t) => [t.title, t]));
    expect(Object.keys(byTitle)).toEqual(['Parameters', 'Geometry', 'Materials', 'Boundary conditions and sources', 'Mesh']);
    expect(byTitle.Parameters.rows.find((r) => r.cells[0] === 'w')!.cells).toEqual(['w', '2', '2']);
    expect(byTitle.Geometry.rows.find((r) => r.cells[0] === 'top')!.cells[1]).toBe('rectangle (hole)');
    expect(byTitle['Boundary conditions and sources'].rows[0].cells).toEqual(['top', 'potential', 'U = 1']);
    expect(byTitle.Mesh.rows.map((r) => r.cells[0])).toContain('nodes / triangles');
  });

  it('give the results with the textbook comparison', () => {
    const [cap, charge, energy] = resultTables(model, RESULT);
    expect(cap.title).toBe('Capacitance (per metre)');
    expect(cap.rows).toHaveLength(3);
    expect(cap.rows[0].cells[1]).toMatch(/% vs textbook/);
    expect(charge.rows.map((r) => r.cells[0])).toEqual(['top', 'bottom']);
    expect(energy.rows.at(-1)!.cells[0]).toBe('total');
  });

  it('list only studies that have run', () => {
    const run = { key: 'k', points: [{ x: 1, nodes: 10, value: 1e-10 }] };
    const views: FemView[] = [
      { id: 'a', name: 'Not run', type: 'convergence', quantity: 'capacitance', steps: 5 },
      { id: 'b', name: 'Sweep', type: 'sweep', quantity: 'energy', parameter: 'd', from: 1, to: 2, steps: 2, run },
    ];
    const tables = studyTables({ ...model, views });
    expect(tables.map((t) => t.title)).toEqual(['Sweep (d from 1 to 2)']);
  });

  it('file names come from the model name', () => {
    expect(exportName(model, 'solution', 'vtu')).toBe('Plate_capacitor-solution.vtu');
  });
});
