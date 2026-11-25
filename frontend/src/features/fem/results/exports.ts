/**
 * FEM Studio exports built in the browser from the solve result:
 * the solution as VTU (ParaView), line probes and studies as CSV,
 * and the tables of the PDF report.
 */
import { safeFilename } from '@/utils/exportData';
import type { PDFTableSection } from '@/utils/pdfDataBuilders';
import type { SolveResult } from '../api';
import { evaluate, evaluateParameters, type Expr } from '../expressions';
import { sampleLine } from '../lineProbe';
import { EPSILON_0, TEMPLATES, type FemModel, type FemView } from '../model';
import { STEPS, describeStep } from '../geometry/steps';
import { si } from '../views/geometryDraw';
import { analyticValue, convergence, exactValue, type StudyView } from './studies';
import { lineEnds } from './views';

type LineView = Extract<FemView, { type: 'line' }>;

// ── ParaView ─────────────────────────────────────────────────────────

const VTK_TRIANGLE = 5;
const num = (v: number) => (Number.isFinite(v) ? String(v) : '0');

function dataArray(name: string, values: ArrayLike<number>, components = 1, type = 'Float64'): string {
  const comps = components > 1 ? ` NumberOfComponents="${components}"` : '';
  const text = Array.from(values, type.startsWith('Float') ? num : String).join(' ');
  return `        <DataArray type="${type}" Name="${name}"${comps} format="ascii">\n          ${text}\n        </DataArray>`;
}

/** 2D vectors (x0, y0, x1, y1, …) as 3-component VTK vectors (z = 0). */
const as3D = (v: number[]) => Array.from({ length: (v.length / 2) * 3 }, (_, i) => (i % 3 === 2 ? 0 : v[(i / 3 | 0) * 2 + (i % 3)]));

/**
 * The solution on its mesh as VTU (VTK UnstructuredGrid, XML, ASCII):
 * triangles in the plane z = 0; V per node; E, D, |E|, domain and εr per element.
 */
export function femVtu(result: SolveResult): string {
  const { nodes, triangles, triangle_domain, domain_names } = result.mesh;
  const nPoints = nodes.length / 2;
  const nCells = triangles.length / 3;
  const e = result.electric_field;
  const eMag = Array.from({ length: nCells }, (_, k) => Math.hypot(e[2 * k], e[2 * k + 1]));
  const epsR = triangle_domain.map((d) => (result.permittivity[domain_names[d]] ?? EPSILON_0) / EPSILON_0);
  return `<?xml version="1.0"?>
<!-- FEM Studio, 2D electrostatics. Domains (index → name): ${domain_names.map((n, i) => `${i}=${n}`).join(', ')} -->
<VTKFile type="UnstructuredGrid" version="1.0" byte_order="LittleEndian">
  <UnstructuredGrid>
    <Piece NumberOfPoints="${nPoints}" NumberOfCells="${nCells}">
      <PointData Scalars="V">
${dataArray('V', result.potential)}
      </PointData>
      <CellData Scalars="E_magnitude" Vectors="E">
${dataArray('E', as3D(e), 3)}
${dataArray('D', as3D(result.flux_density), 3)}
${dataArray('E_magnitude', eMag)}
${dataArray('domain', triangle_domain, 1, 'Int32')}
${dataArray('eps_r', epsR)}
      </CellData>
      <Points>
${dataArray('Points', as3D(nodes), 3)}
      </Points>
      <Cells>
${dataArray('connectivity', triangles, 1, 'Int32')}
${dataArray('offsets', Array.from({ length: nCells }, (_, k) => 3 * (k + 1)), 1, 'Int32')}
${dataArray('types', new Array<number>(nCells).fill(VTK_TRIANGLE), 1, 'UInt8')}
      </Cells>
    </Piece>
  </UnstructuredGrid>
</VTKFile>
`;
}

// ── CSV ──────────────────────────────────────────────────────────────

function csvCell(value: string | number | null | undefined): string {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const csv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

export interface LineProbeData {
  /** FEM and textbook value at each sample (null outside the mesh / where the formula does not apply) */
  samples: { s: number; x: number; y: number; fem: number | null; analytic: number | null }[];
  /** Name of the textbook curve, if the template has one */
  label?: string;
}

/** V or |E| along a line view, with the template's textbook curve where it has one. */
export function lineProbeData(view: LineView, result: SolveResult, model: FemModel): LineProbeData | { error: string } {
  const ends = lineEnds(view, model);
  if ('error' in ends) return ends;
  const template = TEMPLATES.find((t) => t.id === model.template);
  const p = template?.fieldAt ? evaluateParameters(model.parameters) : {};
  const samples = sampleLine(result, ends.start, ends.end, view.quantity).map((s) => {
    const a = template?.fieldAt?.value(s.x, s.y, p);
    return { s: s.s, x: s.x, y: s.y, fem: s.value, analytic: a ? (view.quantity === 'potential' ? a.V : a.E) : null };
  });
  return { samples, label: template?.fieldAt?.label };
}

export function lineProbeCsv(view: LineView, result: SolveResult, model: FemModel): string {
  const data = lineProbeData(view, result, model);
  if ('error' in data) throw new Error(`Line end points: ${data.error}`);
  const q = view.quantity === 'potential' ? 'V [V]' : '|E| [V/m]';
  const header = ['s [m]', 'x [m]', 'y [m]', `${q} FEM`, ...(data.label ? [`${q} ${data.label}`] : [])];
  return csv([header, ...data.samples.map((s) => [s.s, s.x, s.y, s.fem, ...(data.label ? [s.analytic] : [])])]);
}

const UNIT = { capacitance: 'F', energy: 'J' } as const;
const QUANTITY = { capacitance: 'Capacitance', energy: 'Energy' } as const;

/** The points of a study: x, nodes, value, and the error (convergence) or the textbook value (sweep). */
export function studyCsv(view: StudyView, model: FemModel): string {
  const points = view.run?.points ?? [];
  const unit = UNIT[view.quantity];
  if (view.type === 'convergence') {
    const c = convergence(points, exactValue(model, view.quantity));
    return csv([
      ['element size factor', 'nodes', `${view.quantity} [${unit}]`, `relative error (against ${c.against})`, 'seconds', 'error message'],
      ...points.map((p, i) => [p.x, p.nodes, p.value, c.errors[i], p.seconds, p.error]),
      ...(c.reference != null ? [[`reference (${c.against})`, null, c.reference]] : []),
    ]);
  }
  const ref = view.run?.reference;
  return csv([
    [view.parameter, 'nodes', `${view.quantity} [${unit}]`, `textbook [${unit}]`, 'seconds', 'error message'],
    ...points.map((p, i) => [p.x, p.nodes, p.value, ref?.[i] ?? null, p.seconds, p.error]),
  ]);
}

/** File name for an export of this model, e.g. "Coaxial_cable-solution.vtu". */
export const exportName = (model: FemModel, what: string, ext: string) =>
  `${safeFilename(model.name, 'fem-model')}-${safeFilename(what, 'export')}.${ext}`;

// ── PDF report tables ────────────────────────────────────────────────

const exprText = (e: Expr) => String(e);

/** Tables describing the model: parameters, shapes, materials, boundary conditions and sources, mesh. */
export function modelTables(model: FemModel, result?: SolveResult): PDFTableSection[] {
  const p = evaluateParameters(model.parameters);
  const value = (e: Expr) => {
    try {
      return String(Number(evaluate(e, p).toPrecision(6)));
    } catch {
      return '?';
    }
  };
  const tables: PDFTableSection[] = [];
  const params = Object.entries(model.parameters);
  if (params.length) {
    tables.push({ title: 'Parameters', headers: ['Name', 'Expression', 'Value'], rows: params.map(([k, e]) => ({ cells: [k, exprText(e), value(e)] })) });
  }
  tables.push({
    title: 'Geometry',
    headers: ['Step', 'Type', 'Definition'],
    rows: model.steps.map((s) => ({
      cells: [s.name, STEPS[s.kind].label + (model.holes.includes(s.name) ? ' (hole)' : ''), describeStep(s)],
    })),
  });
  const materials = Object.entries(model.materials);
  if (materials.length) {
    tables.push({
      title: 'Materials',
      headers: ['Name', 'Material', 'εr'],
      rows: materials.map(([d, m]) => ({ cells: [d, m.name, String(m.relative_permittivity)] })),
    });
  }
  tables.push({
    title: 'Boundary conditions and sources',
    headers: ['Name', 'Type', 'Value'],
    rows: [
      ...model.boundary_conditions.map((bc) => ({
        cells: [bc.boundary, bc.type.replace(/_/g, ' '), 'value' in bc ? `${exprText(bc.value)} = ${value(bc.value)}` : '0 V'],
      })),
      ...model.sources.map((s) => ({ cells: [s.domain, 'charge density', `${exprText(s.value)} = ${value(s.value)} C/m³`] })),
    ],
  });
  const mesh = [
    { cells: ['max element size', `${exprText(model.mesh.size)} = ${value(model.mesh.size)} m`] },
    ...(model.mesh.min_size != null && model.mesh.min_size !== ''
      ? [{ cells: ['min element size', `${exprText(model.mesh.min_size)} = ${value(model.mesh.min_size)} m`] }]
      : []),
    { cells: ['algorithm', model.mesh.algorithm ?? 'frontal-delaunay'] },
    ...model.mesh.controls.map((c) => ({
      cells: [
        `at ${c.target}`,
        [
          c.size != null && c.size !== '' ? `size ${exprText(c.size)} = ${value(c.size)} m` : '',
          c.divisions != null && c.divisions !== '' ? `${value(c.divisions)} divisions${c.grading != null && c.grading !== 1 ? `, grading ${exprText(c.grading)}` : ''}` : '',
          c.structured ? 'structured' : '',
        ]
          .filter(Boolean)
          .join(', '),
      ],
    })),
    { cells: ['elements', 'P1 (linear triangles)'] },
    { cells: ['depth (2D plane)', `${model.depth} m`] },
  ];
  if (result) {
    const st = result.mesh.stats;
    mesh.push(
      { cells: ['nodes / triangles', `${st.nodes.toLocaleString('en')} / ${st.triangles.toLocaleString('en')}`] },
      { cells: ['element quality (min / mean)', `${st.quality.min.toFixed(2)} / ${st.quality.mean.toFixed(2)}`] },
    );
  }
  tables.push({ title: 'Mesh', headers: ['Setting', 'Value'], rows: mesh });
  return tables;
}

/** Tables of the integral results: capacitance (with the textbook value), charges, energy. */
export function resultTables(model: FemModel, result: SolveResult): PDFTableSection[] {
  const tables: PDFTableSection[] = [];
  const c = result.capacitance;
  if (c) {
    const textbook = analyticValue(model, 'capacitance');
    const label = TEMPLATES.find((t) => t.id === model.template)?.analytic?.label;
    const diff = (v: number) => (textbook ? ` (${(100 * (v / textbook - 1)).toFixed(2)} % vs textbook)` : '');
    tables.push({
      title: `Capacitance${model.depth === 1 ? ' (per metre)' : ''}`,
      headers: ['Quantity', 'Value'],
      rows: [
        { cells: ['from the charge, Q/ΔV', si(c.from_charge, 'F') + diff(c.from_charge)] },
        { cells: ['from the energy, 2W/ΔV²', si(c.from_energy, 'F') + diff(c.from_energy)] },
        ...(textbook && label ? [{ cells: [label, si(textbook, 'F')] }] : []),
      ],
    });
  }
  tables.push({
    title: 'Charge on each electrode',
    headers: ['Boundary', 'reaction K·u − f', 'flux ∮ D·n'],
    rows: Object.entries(result.charge).map(([b, q]) => ({ cells: [b, si(q, 'C'), si(result.charge_from_flux[b], 'C')] })),
  });
  tables.push({
    title: 'Field energy W = ½·uᵀKu',
    headers: ['Domain', 'Energy'],
    rows: [
      ...Object.entries(result.energy_by_domain).map(([d, w]) => ({
        cells: [d, `${si(w, 'J')} (${((100 * w) / result.energy).toFixed(1)} %)`],
      })),
      { cells: ['total', si(result.energy, 'J')] },
    ],
  });
  return tables;
}

/** One table per study that has run: its points and (convergence) the reference and order. */
export function studyTables(model: FemModel): PDFTableSection[] {
  return (model.views ?? []).flatMap((v): PDFTableSection[] => {
    if ((v.type !== 'convergence' && v.type !== 'sweep') || !v.run?.points.length) return [];
    const unit = UNIT[v.quantity];
    if (v.type === 'convergence') {
      const c = convergence(v.run.points, exactValue(model, v.quantity));
      const order = c.orderH != null ? `, measured order h^${c.orderH.toFixed(2)}` : '';
      return [
        {
          title: `${v.name} (error against ${c.against === 'analytic' ? 'the exact value' : c.against === 'extrapolated' ? 'the extrapolated value' : 'the finest mesh'}${order})`,
          headers: ['Element size ×', 'Nodes', QUANTITY[v.quantity], 'Error'],
          rows: v.run.points.map((p, i) => ({
            cells: [String(p.x), p.nodes?.toLocaleString('en') ?? '', p.error ?? si(p.value!, unit), c.errors[i] != null ? `${(100 * c.errors[i]!).toPrecision(3)} %` : ''],
          })),
        },
      ];
    }
    return [
      {
        title: `${v.name} (${v.parameter} from ${v.from} to ${v.to})`,
        headers: [v.parameter, 'Nodes', QUANTITY[v.quantity], 'Textbook'],
        rows: v.run.points.map((p, i) => ({
          cells: [String(p.x), p.nodes?.toLocaleString('en') ?? '', p.error ?? si(p.value!, unit), v.run?.reference?.[i] != null ? si(v.run.reference[i]!, unit) : '—'],
        })),
      },
    ];
  });
}
