/**
 * The FEM Studio model: what the user builds across the tabs. Mirrors the
 * backend schemas (mesher Geometry2D, fem_solver Electrostatics).
 */
import type { Expr } from './expressions';

export const EPSILON_0 = 8.8541878128e-12;

/** A point of a polygon/polyline/spline: x, y */
export type Point2 = [Expr, Expr];

/**
 * One step of the geometry sequence (mesher/src/fem_mesher/geometry.py).
 * Each step creates one object named after it; booleans, arrays and
 * "surface" consume their inputs, transforms change objects in place (or add
 * a copy with keep).
 */
export type Step =
  | { kind: 'rectangle'; name: string; x: Expr; y: Expr; width: Expr; height: Expr; rotation?: Expr; corner_radius?: Expr }
  | { kind: 'circle'; name: string; cx: Expr; cy: Expr; r: Expr }
  | { kind: 'ellipse'; name: string; cx: Expr; cy: Expr; rx: Expr; ry: Expr; rotation?: Expr }
  | { kind: 'sector'; name: string; cx: Expr; cy: Expr; r: Expr; start: Expr; end: Expr; r_inner?: Expr }
  | { kind: 'polygon'; name: string; points: Point2[] }
  | { kind: 'polyline'; name: string; points: Point2[]; closed?: boolean }
  | { kind: 'arc'; name: string; cx: Expr; cy: Expr; r: Expr; start: Expr; end: Expr }
  | { kind: 'spline'; name: string; points: Point2[] }
  | { kind: 'point'; name: string; x: Expr; y: Expr }
  | { kind: 'surface'; name: string; curves: string[] }
  | { kind: 'union'; name: string; objects: string[]; keep?: boolean; interior?: boolean }
  | { kind: 'intersection'; name: string; objects: string[]; keep?: boolean }
  | { kind: 'difference'; name: string; objects: string[]; tools: string[]; keep?: boolean }
  | { kind: 'move'; name: string; objects: string[]; dx: Expr; dy: Expr; keep?: boolean }
  | { kind: 'rotate'; name: string; objects: string[]; cx: Expr; cy: Expr; angle: Expr; keep?: boolean }
  | { kind: 'scale'; name: string; objects: string[]; cx: Expr; cy: Expr; factor: Expr; factor_y?: Expr | null; keep?: boolean }
  | { kind: 'mirror'; name: string; objects: string[]; x: Expr; y: Expr; angle: Expr; keep?: boolean }
  | { kind: 'array'; name: string; objects: string[]; count: number; dx: Expr; dy: Expr }
  | { kind: 'polar_array'; name: string; objects: string[]; count: number; cx: Expr; cy: Expr; angle: Expr }
  | { kind: 'delete'; name: string; objects: string[] };

export type StepKind = Step['kind'];

/** Named boundaries beyond the automatic ones */
export type Selection =
  | { kind: 'box'; name: string; xmin: Expr; ymin: Expr; xmax: Expr; ymax: Expr }
  | { kind: 'points'; name: string; points: Point2[] }
  | { kind: 'boundary_of'; name: string; domains: string[] };

/** Local discretisation of a domain, boundary, curve or point */
export interface BoundaryLayer {
  first: Expr;
  growth?: Expr;
  layers?: number;
}

export interface MeshControl {
  target: string;
  size?: Expr | null;
  divisions?: Expr | null;
  grading?: Expr;
  structured?: boolean;
  /** Rows of thin elements along a boundary or curve */
  boundary_layer?: BoundaryLayer | null;
}

export type MeshAlgorithm = 'frontal-delaunay' | 'delaunay' | 'meshadapt';

export interface MeshSettings {
  size: Expr;
  min_size?: Expr | null;
  algorithm?: MeshAlgorithm;
  /** 2: elements with edge midpoints (export only: the built-in solver is P1) */
  order: 1 | 2;
  /** quad: quadrilaterals (export only) */
  element?: 'triangle' | 'quad';
  elements_per_circle: number;
  smoothing?: number;
  controls: MeshControl[];
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
  version: 2;
  name: string;
  template?: TemplateId;
  parameters: Record<string, Expr>;
  steps: Step[];
  holes: string[];
  selections: Selection[];
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
  | { id: string; name: string; type: 'quantities' }
  | {
      id: string;
      name: string;
      type: 'convergence';
      quantity: StudyQuantity;
      /** Number of meshes, from twice the model's element size down by factors of √2 */
      steps: number;
      run?: StudyRun;
    }
  | {
      id: string;
      name: string;
      type: 'sweep';
      quantity: StudyQuantity;
      parameter: string;
      from: Expr;
      to: Expr;
      steps: number;
      run?: StudyRun;
    };

/** What a study follows: the capacitance (from the energy, 2W/ΔV²) or the field energy */
export type StudyQuantity = 'capacitance' | 'energy';

/** One solve of a study: its x (mesh scale or parameter value) and the outcome */
export interface StudyPoint {
  x: number;
  nodes?: number;
  value?: number;
  seconds?: number;
  error?: string;
}

/** A finished (or cancelled) study, saved with its view; `key` tells whether the model changed since */
export interface StudyRun {
  key: string;
  points: StudyPoint[];
  /** The textbook value(s) at each x, where the template has one */
  reference?: (number | null)[];
}

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
  /**
   * Textbook reference value to compare with (per metre of depth for 2D plane).
   * `exact`: the limit FEM converges to (coax); otherwise a simpler model
   * (plates without fringing), shown for comparison but not used as the error reference.
   */
  analytic?: { label: string; quantity: 'capacitance'; exact: boolean; value: (p: Record<string, number>, m: FemModel) => number };
  /** Textbook V and |E| at a point (line probes), or null where it does not apply */
  fieldAt?: { label: string; value: (x: number, y: number, p: Record<string, number>) => { V: number; E: number } | null };
}

const baseMesh = (size: Expr, controls: MeshControl[] = []): MeshSettings => ({
  size,
  order: 1,
  elements_per_circle: 48,
  controls,
});

export const TEMPLATES: Template[] = [
  {
    id: 'plate-capacitor',
    title: 'Plate capacitor',
    description:
      'Two electrodes with a dielectric between them, inside an air box. The field leaks out at the plate edges ("fringing"), so C is a bit larger than εA/d.',
    model: {
      version: 2,
      name: 'Plate capacitor',
      template: 'plate-capacitor',
      parameters: { w: 0.04, d: 0.004, t: 0.001, U: 1 },
      steps: [
        { kind: 'rectangle', name: 'air', x: '-w', y: '-w', width: '2*w', height: '2*w' },
        { kind: 'rectangle', name: 'dielectric', x: '-w/2', y: '-d/2', width: 'w', height: 'd' },
        { kind: 'rectangle', name: 'top', x: '-w/2', y: 'd/2', width: 'w', height: 't' },
        { kind: 'rectangle', name: 'bottom', x: '-w/2', y: '-d/2-t', width: 'w', height: 't' },
      ],
      holes: ['top', 'bottom'],
      selections: [],
      mesh: baseMesh('w/8', [
        { target: 'top', size: 'd/6' },
        { target: 'bottom', size: 'd/6' },
      ]),
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
      exact: false,
      value: (p, m) => (EPSILON_0 * (m.materials.dielectric?.relative_permittivity ?? 1) * p.w * m.depth) / p.d,
    },
  },
  {
    id: 'coax',
    title: 'Coaxial cable',
    description:
      'Inner conductor at U, outer conductor grounded, PTFE in between. The exact capacitance is 2πε/ln(b/a) per metre: compare it with FEM and refine the mesh.',
    model: {
      version: 2,
      name: 'Coaxial cable',
      template: 'coax',
      parameters: { a: 0.0005, b: 0.0017, U: 1 },
      steps: [
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
      exact: true,
      value: (p, m) =>
        (2 * Math.PI * EPSILON_0 * (m.materials.dielectric?.relative_permittivity ?? 1) * m.depth) /
        Math.log(p.b / p.a),
    },
  },
];

export const EMPTY_MODEL: FemModel = {
  version: 2,
  name: 'New model',
  parameters: {},
  steps: [],
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
  return { version: 2, parameters: m.parameters, steps: m.steps, holes: m.holes, selections: m.selections, mesh: m.mesh };
}

/**
 * A saved model as a version-2 model, or null if it is none. Version 1 (a
 * flat list of shapes, sizes per domain/boundary) upgrades like the backend's
 * upgrade_v1: shapes are primitive steps, selections boxes, sizes controls.
 */
export function upgradeModel(raw: unknown): FemModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.version === 2 && Array.isArray(m.steps)) return m as unknown as FemModel;
  if (m.version !== 1 || !Array.isArray(m.shapes)) return null;
  const { shapes, ...rest } = m as { shapes: Step[] } & Record<string, unknown>;
  const mesh = (m.mesh ?? {}) as Record<string, unknown>;
  const { domain_sizes = {}, boundary_sizes = {}, ...meshRest } = mesh as {
    domain_sizes?: Record<string, Expr>;
    boundary_sizes?: Record<string, Expr>;
  };
  const sizes = { ...domain_sizes, ...boundary_sizes };
  return {
    ...(rest as unknown as FemModel),
    version: 2,
    steps: shapes,
    selections: ((m.selections ?? []) as Selection[]).map((s) => ({ ...s, kind: 'box' }) as Selection),
    mesh: {
      ...(meshRest as unknown as MeshSettings),
      controls: Object.entries(sizes).map(([target, size]) => ({ target, size })),
    },
  };
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

/** Why the built-in P1 solver cannot use this mesh (it can still be exported to openCFS), or null. */
export function exportOnly(m: FemModel): string | null {
  if (m.mesh.element === 'quad') return 'Quadrilateral elements';
  if (m.mesh.order === 2) return 'Second-order elements';
  return null;
}

export function isDirichlet(bc: BoundaryCondition) {
  return bc.type === 'ground' || bc.type === 'potential';
}
