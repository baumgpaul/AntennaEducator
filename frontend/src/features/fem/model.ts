/**
 * The FEM Studio model: what the user builds across the tabs. Mirrors the
 * backend schemas (mesher Geometry2D, fem_solver Electrostatics).
 */
import type { Expr } from './expressions';

export const EPSILON_0 = 8.8541878128e-12;

export type Shape =
  | { kind: 'rectangle'; name: string; x: Expr; y: Expr; width: Expr; height: Expr }
  | { kind: 'circle'; name: string; cx: Expr; cy: Expr; r: Expr }
  | { kind: 'polygon'; name: string; points: [Expr, Expr][] };

export interface BoxSelection {
  name: string;
  xmin: Expr;
  ymin: Expr;
  xmax: Expr;
  ymax: Expr;
}

export interface MeshSettings {
  size: Expr;
  domain_sizes: Record<string, Expr>;
  boundary_sizes: Record<string, Expr>;
  order: 1;
  elements_per_circle: number;
}

export interface Material {
  name: string;
  relative_permittivity: number;
}

export type BoundaryCondition =
  | { type: 'ground'; boundary: string }
  | { type: 'potential'; boundary: string; value: Expr }
  | { type: 'surface_charge_density'; boundary: string; value: Expr };

export interface ChargeDensity {
  type: 'charge_density';
  domain: string;
  value: Expr;
}

export interface FemModel {
  version: 1;
  name: string;
  template?: TemplateId;
  parameters: Record<string, Expr>;
  shapes: Shape[];
  holes: string[];
  selections: BoxSelection[];
  mesh: MeshSettings;
  depth: number;
  materials: Record<string, Material>; // domain -> material
  boundary_conditions: BoundaryCondition[];
  sources: ChargeDensity[];
  /** Results workspace: the user's views (saved with the project) */
  views?: FemView[];
}

export type FemView =
  | {
      id: string;
      name: string;
      type: 'field';
      quantity: 'potential' | 'E' | 'D';
      contours: boolean;
      arrows: boolean;
      colorMap: 'viridis' | 'plasma' | 'turbo' | 'jet';
    }
  | {
      id: string;
      name: string;
      type: 'line';
      quantity: 'potential' | 'E';
      start: [Expr, Expr];
      end: [Expr, Expr];
    }
  | { id: string; name: string; type: 'quantities' };

/** Common materials (εr, static). Students can also type their own. */
export const MATERIAL_LIBRARY: Material[] = [
  { name: 'Air', relative_permittivity: 1.0006 },
  { name: 'Vacuum', relative_permittivity: 1 },
  { name: 'PTFE (Teflon)', relative_permittivity: 2.1 },
  { name: 'Polyethylene', relative_permittivity: 2.25 },
  { name: 'FR4', relative_permittivity: 4.4 },
  { name: 'Glass', relative_permittivity: 6 },
  { name: 'Alumina', relative_permittivity: 9.8 },
  { name: 'Water (20 °C)', relative_permittivity: 80 },
];

export type TemplateId = 'plate-capacitor' | 'coax';

export interface Template {
  id: TemplateId;
  title: string;
  description: string;
  model: FemModel;
  /** Textbook reference value to compare with (per metre of depth for 2D plane) */
  analytic?: { label: string; quantity: 'capacitance'; value: (p: Record<string, number>, m: FemModel) => number };
  /** Textbook V and |E| at a point (line probes), or null where it does not apply */
  fieldAt?: { label: string; value: (x: number, y: number, p: Record<string, number>) => { V: number; E: number } | null };
}

const baseMesh = (size: Expr, boundary_sizes: Record<string, Expr> = {}): MeshSettings => ({
  size,
  domain_sizes: {},
  boundary_sizes,
  order: 1,
  elements_per_circle: 48,
});

export const TEMPLATES: Template[] = [
  {
    id: 'plate-capacitor',
    title: 'Plate capacitor',
    description:
      'Two electrodes with a dielectric between them, inside an air box. The field leaks out at the plate edges ("fringing"), so C is a bit larger than εA/d.',
    model: {
      version: 1,
      name: 'Plate capacitor',
      template: 'plate-capacitor',
      parameters: { w: 0.04, d: 0.004, t: 0.001, U: 1 },
      shapes: [
        { kind: 'rectangle', name: 'air', x: '-w', y: '-w', width: '2*w', height: '2*w' },
        { kind: 'rectangle', name: 'dielectric', x: '-w/2', y: '-d/2', width: 'w', height: 'd' },
        { kind: 'rectangle', name: 'top', x: '-w/2', y: 'd/2', width: 'w', height: 't' },
        { kind: 'rectangle', name: 'bottom', x: '-w/2', y: '-d/2-t', width: 'w', height: 't' },
      ],
      holes: ['top', 'bottom'],
      selections: [],
      mesh: baseMesh('w/8', { top: 'd/6', bottom: 'd/6' }),
      depth: 1,
      materials: {
        air: { name: 'Air', relative_permittivity: 1.0006 },
        dielectric: { name: 'FR4', relative_permittivity: 4.4 },
      },
      boundary_conditions: [
        { type: 'potential', boundary: 'top', value: 'U' },
        { type: 'ground', boundary: 'bottom' },
      ],
      sources: [],
    },
    fieldAt: {
      label: 'Ideal plates (no fringing)',
      value: (x, y, p) =>
        Math.abs(x) <= p.w / 2 && Math.abs(y) <= p.d / 2 ? { V: (p.U * (y + p.d / 2)) / p.d, E: p.U / p.d } : null,
    },
    analytic: {
      label: 'Parallel plates without fringing, εA/d',
      quantity: 'capacitance',
      value: (p, m) => (EPSILON_0 * (m.materials.dielectric?.relative_permittivity ?? 1) * p.w * m.depth) / p.d,
    },
  },
  {
    id: 'coax',
    title: 'Coaxial cable',
    description:
      'Inner conductor at U, outer conductor grounded, PTFE in between. The exact capacitance is 2πε/ln(b/a) per metre: compare it with FEM and refine the mesh.',
    model: {
      version: 1,
      name: 'Coaxial cable',
      template: 'coax',
      parameters: { a: 0.0005, b: 0.0017, U: 1 },
      shapes: [
        { kind: 'circle', name: 'dielectric', cx: 0, cy: 0, r: 'b' },
        { kind: 'circle', name: 'inner', cx: 0, cy: 0, r: 'a' },
      ],
      holes: ['inner'],
      selections: [],
      mesh: baseMesh('(b-a)/6'),
      depth: 1,
      materials: { dielectric: { name: 'PTFE (Teflon)', relative_permittivity: 2.1 } },
      boundary_conditions: [
        { type: 'potential', boundary: 'inner', value: 'U' },
        { type: 'ground', boundary: 'outer' },
      ],
      sources: [],
    },
    fieldAt: {
      label: 'Coax: U·ln(b/r)/ln(b/a)',
      value: (x, y, p) => {
        const r = Math.hypot(x, y);
        if (r < p.a || r > p.b) return null;
        const L = Math.log(p.b / p.a);
        return { V: (p.U * Math.log(p.b / r)) / L, E: p.U / (r * L) };
      },
    },
    analytic: {
      label: 'Coax 2πε/ln(b/a)',
      quantity: 'capacitance',
      value: (p, m) =>
        (2 * Math.PI * EPSILON_0 * (m.materials.dielectric?.relative_permittivity ?? 1) * m.depth) /
        Math.log(p.b / p.a),
    },
  },
];

export const EMPTY_MODEL: FemModel = {
  version: 1,
  name: 'New model',
  parameters: {},
  shapes: [],
  holes: [],
  selections: [],
  mesh: baseMesh(0.01),
  depth: 1,
  materials: {},
  boundary_conditions: [],
  sources: [],
};

/** Request bodies for the FEM service */
export function geometryOf(m: FemModel) {
  return { parameters: m.parameters, shapes: m.shapes, holes: m.holes, selections: m.selections, mesh: m.mesh };
}

export function problemOf(m: FemModel) {
  return {
    physics: 'electrostatics' as const,
    depth: m.depth,
    parameters: m.parameters,
    materials: m.materials,
    boundary_conditions: m.boundary_conditions,
    sources: m.sources,
  };
}

/** Stable key of a part of the model: results are "current" while it is unchanged. */
export const keyOf = (value: unknown) => JSON.stringify(value);

export function isDirichlet(bc: BoundaryCondition) {
  return bc.type === 'ground' || bc.type === 'potential';
}
