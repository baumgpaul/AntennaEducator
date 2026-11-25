/**
 * The kinds of geometry steps: what the ribbon offers, what the properties
 * panel edits and how the tree and the report describe them. Mirrors the
 * mesher's schema (mesher/src/fem_mesher/geometry.py).
 */
import type { SvgIconComponent } from '@mui/icons-material';
import {
  AspectRatio,
  ChangeHistory,
  CropSquare,
  DonutLarge,
  EggOutlined,
  FiberManualRecord,
  Flip,
  FormatColorFill,
  Gesture,
  JoinFull,
  JoinInner,
  JoinLeft,
  Looks,
  OpenWith,
  PanoramaFishEye,
  Polyline,
  RotateRight,
  TrackChanges,
  ViewWeek,
  DeleteOutlined,
} from '@mui/icons-material';
import type { Expr } from '../expressions';
import type { Point2, Selection, Step, StepKind } from '../model';

export type FieldSpec =
  | { key: string; label: string; type: 'expr'; unit?: 'm' | '°' | '×'; optional?: boolean }
  | { key: string; label: string; type: 'count'; min: number; max: number }
  | { key: string; label: string; type: 'bool'; help: string }
  | { key: string; label: string; type: 'points'; min: number }
  /** Names of earlier objects; `dims` = allowed dimensions */
  | { key: string; label: string; type: 'objects'; min: number; dims: (0 | 1 | 2)[] };

export type StepGroup = 'shape' | 'curve' | 'combine' | 'transform';

export interface StepInfo {
  kind: StepKind;
  label: string;
  group: StepGroup;
  /** Dimension of the object it creates; null: transforms in place (or like their inputs) */
  dim: 0 | 1 | 2 | null;
  icon: SvgIconComponent;
  help: string;
  /** Name prefix of new steps */
  prefix: string;
  fields: FieldSpec[];
  /** A new step around (x, y), size h, on the selected objects */
  create: (name: string, at: { x: number; y: number; h: number }, selected: string[]) => Step;
}

const tidy = (v: number) => Number(v.toPrecision(4));
const KEEP: FieldSpec = { key: 'keep', label: 'keep inputs', type: 'bool', help: 'Keep the inputs and add the result as a new object' };
const KEEP_COPY: FieldSpec = { key: 'keep', label: 'copy', type: 'bool', help: 'Keep the objects and add the transformed copies as a new object' };
const objects = (label = 'objects', min = 1, dims: (0 | 1 | 2)[] = [0, 1, 2]): FieldSpec => ({ key: 'objects', label, type: 'objects', min, dims });
const pt = (x: number, y: number): Point2 => [tidy(x), tidy(y)];

export const STEPS: Record<StepKind, StepInfo> = {
  rectangle: {
    kind: 'rectangle', label: 'Rectangle', group: 'shape', dim: 2, icon: CropSquare, prefix: 'rect',
    help: 'Lower-left corner, width and height; optionally rotated about the corner and with rounded corners.',
    fields: [
      { key: 'x', label: 'x', type: 'expr', unit: 'm' },
      { key: 'y', label: 'y', type: 'expr', unit: 'm' },
      { key: 'width', label: 'width', type: 'expr', unit: 'm' },
      { key: 'height', label: 'height', type: 'expr', unit: 'm' },
      { key: 'rotation', label: 'rotation', type: 'expr', unit: '°', optional: true },
      { key: 'corner_radius', label: 'corner radius', type: 'expr', unit: 'm', optional: true },
    ],
    create: (name, { x, y, h }) => ({ kind: 'rectangle', name, x: tidy(x - h), y: tidy(y - h / 2), width: tidy(2 * h), height: tidy(h) }),
  },
  circle: {
    kind: 'circle', label: 'Circle', group: 'shape', dim: 2, icon: PanoramaFishEye, prefix: 'circle',
    help: 'Centre and radius.',
    fields: [
      { key: 'cx', label: 'cx', type: 'expr', unit: 'm' },
      { key: 'cy', label: 'cy', type: 'expr', unit: 'm' },
      { key: 'r', label: 'r', type: 'expr', unit: 'm' },
    ],
    create: (name, { x, y, h }) => ({ kind: 'circle', name, cx: tidy(x), cy: tidy(y), r: tidy(h / 2) }),
  },
  ellipse: {
    kind: 'ellipse', label: 'Ellipse', group: 'shape', dim: 2, icon: EggOutlined, prefix: 'ellipse',
    help: 'Centre, semi-axes along x and y, optional rotation.',
    fields: [
      { key: 'cx', label: 'cx', type: 'expr', unit: 'm' },
      { key: 'cy', label: 'cy', type: 'expr', unit: 'm' },
      { key: 'rx', label: 'rx', type: 'expr', unit: 'm' },
      { key: 'ry', label: 'ry', type: 'expr', unit: 'm' },
      { key: 'rotation', label: 'rotation', type: 'expr', unit: '°', optional: true },
    ],
    create: (name, { x, y, h }) => ({ kind: 'ellipse', name, cx: tidy(x), cy: tidy(y), rx: tidy(h), ry: tidy(h / 2) }),
  },
  sector: {
    kind: 'sector', label: 'Sector / ring', group: 'shape', dim: 2, icon: DonutLarge, prefix: 'sector',
    help: 'Part of a disk from start to end angle (counter-clockwise); with an inner radius an annular sector, 0…360° a ring.',
    fields: [
      { key: 'cx', label: 'cx', type: 'expr', unit: 'm' },
      { key: 'cy', label: 'cy', type: 'expr', unit: 'm' },
      { key: 'r', label: 'r', type: 'expr', unit: 'm' },
      { key: 'r_inner', label: 'inner r', type: 'expr', unit: 'm', optional: true },
      { key: 'start', label: 'start', type: 'expr', unit: '°' },
      { key: 'end', label: 'end', type: 'expr', unit: '°' },
    ],
    create: (name, { x, y, h }) => ({ kind: 'sector', name, cx: tidy(x), cy: tidy(y), r: tidy(h), start: 0, end: 90 }),
  },
  polygon: {
    kind: 'polygon', label: 'Polygon', group: 'shape', dim: 2, icon: ChangeHistory, prefix: 'poly',
    help: 'Corners in order (at least 3).',
    fields: [{ key: 'points', label: 'corners', type: 'points', min: 3 }],
    create: (name, { x, y, h }) => ({ kind: 'polygon', name, points: [pt(x - h / 2, y - h / 2), pt(x + h / 2, y - h / 2), pt(x, y + h / 2)] }),
  },
  polyline: {
    kind: 'polyline', label: 'Line', group: 'curve', dim: 1, icon: Polyline, prefix: 'line',
    help: 'Straight segments through the points. Inside a domain it becomes a named line the mesh follows (e.g. a thin electrode); lines can also bound a surface.',
    fields: [
      { key: 'points', label: 'points', type: 'points', min: 2 },
      { key: 'closed', label: 'closed', type: 'bool', help: 'Join the last point to the first' },
    ],
    create: (name, { x, y, h }) => ({ kind: 'polyline', name, points: [pt(x - h, y), pt(x + h, y)] }),
  },
  arc: {
    kind: 'arc', label: 'Arc', group: 'curve', dim: 1, icon: Looks, prefix: 'arc',
    help: 'Circular arc from start to end angle (counter-clockwise).',
    fields: [
      { key: 'cx', label: 'cx', type: 'expr', unit: 'm' },
      { key: 'cy', label: 'cy', type: 'expr', unit: 'm' },
      { key: 'r', label: 'r', type: 'expr', unit: 'm' },
      { key: 'start', label: 'start', type: 'expr', unit: '°' },
      { key: 'end', label: 'end', type: 'expr', unit: '°' },
    ],
    create: (name, { x, y, h }) => ({ kind: 'arc', name, cx: tidy(x), cy: tidy(y), r: tidy(h), start: 0, end: 180 }),
  },
  spline: {
    kind: 'spline', label: 'Spline', group: 'curve', dim: 1, icon: Gesture, prefix: 'spline',
    help: 'Smooth curve through the points.',
    fields: [{ key: 'points', label: 'points', type: 'points', min: 2 }],
    create: (name, { x, y, h }) => ({ kind: 'spline', name, points: [pt(x - h, y), pt(x, y + h / 2), pt(x + h, y)] }),
  },
  point: {
    kind: 'point', label: 'Point', group: 'curve', dim: 0, icon: FiberManualRecord, prefix: 'pt',
    help: 'A mesh node at this place: refine the mesh around it, or probe the field there.',
    fields: [
      { key: 'x', label: 'x', type: 'expr', unit: 'm' },
      { key: 'y', label: 'y', type: 'expr', unit: 'm' },
    ],
    create: (name, { x, y }) => ({ kind: 'point', name, x: tidy(x), y: tidy(y) }),
  },
  surface: {
    kind: 'surface', label: 'Fill curves', group: 'combine', dim: 2, icon: FormatColorFill, prefix: 'surf',
    help: 'The surface inside a closed loop of lines, arcs and splines (in any order). Build any shape from lines.',
    fields: [{ key: 'curves', label: 'curves', type: 'objects', min: 1, dims: [1] }],
    create: (name, _at, selected) => ({ kind: 'surface', name, curves: selected }),
  },
  union: {
    kind: 'union', label: 'Union', group: 'combine', dim: null, icon: JoinFull, prefix: 'uni',
    help: 'One object from all inputs (all surfaces, or all curves).',
    fields: [
      objects('objects', 2, [1, 2]),
      KEEP,
      { key: 'interior', label: 'keep inner edges', type: 'bool', help: 'One object, but the edges between the inputs stay: name them (Name edges) for a condition or source on them' },
    ],
    create: (name, _at, selected) => ({ kind: 'union', name, objects: selected }),
  },
  difference: {
    kind: 'difference', label: 'Difference', group: 'combine', dim: null, icon: JoinLeft, prefix: 'dif',
    help: 'The objects with the tools cut away. Select the object first, then the tools.',
    fields: [objects('objects', 1, [1, 2]), { key: 'tools', label: 'subtract', type: 'objects', min: 1, dims: [1, 2] }, KEEP],
    create: (name, _at, selected) => ({ kind: 'difference', name, objects: selected.slice(0, 1), tools: selected.slice(1) }),
  },
  intersection: {
    kind: 'intersection', label: 'Intersection', group: 'combine', dim: null, icon: JoinInner, prefix: 'int',
    help: 'Only what all inputs have in common.',
    fields: [objects('objects', 2, [1, 2]), KEEP],
    create: (name, _at, selected) => ({ kind: 'intersection', name, objects: selected }),
  },
  move: {
    kind: 'move', label: 'Move', group: 'transform', dim: null, icon: OpenWith, prefix: 'mov',
    help: 'Shift the objects by (dx, dy).',
    fields: [objects(), { key: 'dx', label: 'dx', type: 'expr', unit: 'm' }, { key: 'dy', label: 'dy', type: 'expr', unit: 'm' }, KEEP_COPY],
    create: (name, { h }, selected) => ({ kind: 'move', name, objects: selected, dx: tidy(h), dy: 0 }),
  },
  rotate: {
    kind: 'rotate', label: 'Rotate', group: 'transform', dim: null, icon: RotateRight, prefix: 'rot',
    help: 'Rotate counter-clockwise about (cx, cy).',
    fields: [
      objects(),
      { key: 'cx', label: 'cx', type: 'expr', unit: 'm' },
      { key: 'cy', label: 'cy', type: 'expr', unit: 'm' },
      { key: 'angle', label: 'angle', type: 'expr', unit: '°' },
      KEEP_COPY,
    ],
    create: (name, { x, y }, selected) => ({ kind: 'rotate', name, objects: selected, cx: tidy(x), cy: tidy(y), angle: 45 }),
  },
  scale: {
    kind: 'scale', label: 'Scale', group: 'transform', dim: null, icon: AspectRatio, prefix: 'sca',
    help: 'Scale about (cx, cy); with a factor for y, differently along x and y.',
    fields: [
      objects(),
      { key: 'cx', label: 'cx', type: 'expr', unit: 'm' },
      { key: 'cy', label: 'cy', type: 'expr', unit: 'm' },
      { key: 'factor', label: 'factor', type: 'expr', unit: '×' },
      { key: 'factor_y', label: 'factor y', type: 'expr', unit: '×', optional: true },
      KEEP_COPY,
    ],
    create: (name, { x, y }, selected) => ({ kind: 'scale', name, objects: selected, cx: tidy(x), cy: tidy(y), factor: 2 }),
  },
  mirror: {
    kind: 'mirror', label: 'Mirror', group: 'transform', dim: null, icon: Flip, prefix: 'mir',
    help: 'Mirror across the line through (x, y) at the angle (90° = vertical line).',
    fields: [
      objects(),
      { key: 'x', label: 'x', type: 'expr', unit: 'm' },
      { key: 'y', label: 'y', type: 'expr', unit: 'm' },
      { key: 'angle', label: 'line angle', type: 'expr', unit: '°' },
      KEEP_COPY,
    ],
    create: (name, { x, y }, selected) => ({ kind: 'mirror', name, objects: selected, x: tidy(x), y: tidy(y), angle: 90, keep: true }),
  },
  array: {
    kind: 'array', label: 'Array', group: 'transform', dim: null, icon: ViewWeek, prefix: 'arr',
    help: 'Copies at multiples of (dx, dy), the original included: one object.',
    fields: [
      objects(),
      { key: 'count', label: 'count', type: 'count', min: 1, max: 200 },
      { key: 'dx', label: 'dx', type: 'expr', unit: 'm' },
      { key: 'dy', label: 'dy', type: 'expr', unit: 'm' },
    ],
    create: (name, { h }, selected) => ({ kind: 'array', name, objects: selected, count: 3, dx: tidy(2 * h), dy: 0 }),
  },
  delete: {
    kind: 'delete', label: 'Delete', group: 'transform', dim: null, icon: DeleteOutlined, prefix: 'del',
    help: 'Removes objects from the model from here on (e.g. an input a combination kept). Delete this step to bring them back.',
    fields: [objects()],
    create: (name, _at, selected) => ({ kind: 'delete', name, objects: selected }),
  },
  polar_array: {
    kind: 'polar_array', label: 'Polar array', group: 'transform', dim: null, icon: TrackChanges, prefix: 'pol',
    help: 'Copies rotated about (cx, cy) by multiples of the angle: one object.',
    fields: [
      objects(),
      { key: 'count', label: 'count', type: 'count', min: 1, max: 200 },
      { key: 'cx', label: 'cx', type: 'expr', unit: 'm' },
      { key: 'cy', label: 'cy', type: 'expr', unit: 'm' },
      { key: 'angle', label: 'angle', type: 'expr', unit: '°' },
    ],
    create: (name, { x, y }, selected) => ({ kind: 'polar_array', name, objects: selected, count: 6, cx: tidy(x), cy: tidy(y), angle: 60 }),
  },
};

export const STEP_GROUPS: { group: StepGroup; label: string; kinds: StepKind[] }[] = [
  { group: 'shape', label: 'Shapes', kinds: ['rectangle', 'circle', 'ellipse', 'sector', 'polygon'] },
  { group: 'curve', label: 'Lines & points', kinds: ['polyline', 'arc', 'spline', 'point'] },
  { group: 'combine', label: 'Combine', kinds: ['union', 'difference', 'intersection', 'surface'] },
  { group: 'transform', label: 'Transform', kinds: ['move', 'rotate', 'scale', 'mirror', 'array', 'polar_array'] },
];

/** The names a step uses (consumed or transformed), in order. */
export function inputsOf(step: Step): string[] {
  if ('curves' in step) return step.curves;
  if ('tools' in step) return [...step.objects, ...step.tools];
  if ('objects' in step) return step.objects;
  return [];
}

/** Does the step consume its inputs (they are gone afterwards)? */
export function consumes(step: Step): boolean {
  if (step.kind === 'surface' || step.kind === 'array' || step.kind === 'polar_array' || step.kind === 'delete') return true;
  if (step.kind === 'union' || step.kind === 'intersection' || step.kind === 'difference') return !step.keep;
  return false;
}

/** Does the step create an object named after it? (transforms only with keep) */
export function creates(step: Step): boolean {
  if (step.kind === 'delete') return false;
  return !(['move', 'rotate', 'scale', 'mirror'] as StepKind[]).includes(step.kind) || !!(step as { keep?: boolean }).keep;
}

/** Short text of a step's definition (tree tooltip, report). */
export function describeStep(step: Step): string {
  const e = (v: Expr | null | undefined) => (v === undefined || v === null ? '' : String(v));
  const pts = (p: Point2[]) => p.map(([x, y]) => `(${e(x)}, ${e(y)})`).join(' ');
  switch (step.kind) {
    case 'rectangle':
      return `corner (${e(step.x)}, ${e(step.y)}), ${e(step.width)} × ${e(step.height)}` +
        (step.rotation ? `, rotated ${e(step.rotation)}°` : '') + (step.corner_radius ? `, corners r ${e(step.corner_radius)}` : '');
    case 'circle':
      return `centre (${e(step.cx)}, ${e(step.cy)}), r ${e(step.r)}`;
    case 'ellipse':
      return `centre (${e(step.cx)}, ${e(step.cy)}), ${e(step.rx)} × ${e(step.ry)}` + (step.rotation ? `, rotated ${e(step.rotation)}°` : '');
    case 'sector':
      return `centre (${e(step.cx)}, ${e(step.cy)}), r ${step.r_inner ? `${e(step.r_inner)}…` : ''}${e(step.r)}, ${e(step.start)}°…${e(step.end)}°`;
    case 'arc':
      return `centre (${e(step.cx)}, ${e(step.cy)}), r ${e(step.r)}, ${e(step.start)}°…${e(step.end)}°`;
    case 'polygon':
    case 'spline':
      return pts(step.points);
    case 'polyline':
      return pts(step.points) + (step.closed ? ', closed' : '');
    case 'point':
      return `(${e(step.x)}, ${e(step.y)})`;
    case 'surface':
      return `inside ${step.curves.join(', ')}`;
    case 'union':
    case 'intersection':
      return (
        step.objects.join(step.kind === 'union' ? ' ∪ ' : ' ∩ ') +
        (step.kind === 'union' && step.interior ? ', inner edges kept' : '') +
        (step.keep ? ' (inputs kept)' : '')
      );
    case 'difference':
      return `${step.objects.join(' ∪ ')} − ${step.tools.join(' − ')}` + (step.keep ? ' (inputs kept)' : '');
    case 'move':
      return `${step.objects.join(', ')} by (${e(step.dx)}, ${e(step.dy)})` + (step.keep ? ', copy' : '');
    case 'rotate':
      return `${step.objects.join(', ')} by ${e(step.angle)}° about (${e(step.cx)}, ${e(step.cy)})` + (step.keep ? ', copy' : '');
    case 'scale':
      return `${step.objects.join(', ')} ×${e(step.factor)}${step.factor_y != null ? ` (y ×${e(step.factor_y)})` : ''} about (${e(step.cx)}, ${e(step.cy)})` + (step.keep ? ', copy' : '');
    case 'mirror':
      return `${step.objects.join(', ')} across the line through (${e(step.x)}, ${e(step.y)}) at ${e(step.angle)}°` + (step.keep ? ', copy' : '');
    case 'array':
      return `${step.count} × ${step.objects.join(', ')}, step (${e(step.dx)}, ${e(step.dy)})`;
    case 'delete':
      return `removes ${step.objects.join(', ')}`;
    case 'polar_array':
      return `${step.count} × ${step.objects.join(', ')}, every ${e(step.angle)}° about (${e(step.cx)}, ${e(step.cy)})`;
  }
}

/** What a mesh control can refine */
export type TargetKind = 'domain' | 'boundary' | 'curve' | 'point';

export const TARGET_HINT: Record<TargetKind, string> = {
  domain: 'Maximum element size inside it; structured: a regular grid (3 or 4 sides).',
  boundary: 'Element size along it (graded back to the global size), or an exact number of elements.',
  curve: 'Element size along it (graded back to the global size), or an exact number of elements.',
  point: 'Element size around it (graded back to the global size).',
};

export const SELECTION_LABEL: Record<Selection['kind'], string> = {
  box: 'Edges inside a box',
  points: 'Edges nearest to points',
  boundary_of: 'Edges of domains',
};
