import { describe, expect, it } from 'vitest';
import { EMPTY_MODEL, TEMPLATES, upgradeModel, type FemModel, type Step } from '../model';
import { fillArea, objectAt, runSequence, type Geo } from '../geometry/sequence';
import { STEPS, describeStep } from '../geometry/steps';

const model = (steps: Step[], extra: Partial<FemModel> = {}): FemModel => ({ ...EMPTY_MODEL, steps, ...extra });
const rect = (name: string, x: number, y: number, width: number, height: number, more = {}): Step =>
  ({ kind: 'rectangle', name, x, y, width, height, ...more }) as Step;
const disk = (name: string, cx: number, cy: number, r: number): Step => ({ kind: 'circle', name, cx, cy, r });
const line = (name: string, ...points: [number, number][]): Step => ({ kind: 'polyline', name, points });
const fill = (seq: ReturnType<typeof runSequence>, name: string) => seq.created[name].geo;
/** Curved edges are sampled (128 per turn): areas within 1e-3 */
const near = (value: number, expected: number) => expect(Math.abs(value / expected - 1)).toBeLessThan(1e-3);

describe('geometry sequence', () => {
  it('evaluates primitives with parameters', () => {
    const seq = runSequence({ ...model([rect('r', 0, 0, 'w', 2), disk('c', 0, 0, 'w')]), parameters: { w: 3 } });
    expect(seq.errors).toEqual([]);
    expect(fillArea(fill(seq, 'r'))).toBeCloseTo(6);
    near(fillArea(fill(seq, 'c')), Math.PI * 9);
    expect(seq.domains).toEqual(['r', 'c']);
  });

  it.each([
    [{ kind: 'rectangle', name: 's', x: 0, y: 0, width: 2, height: 1, corner_radius: 0.2 }, 2 - (4 - Math.PI) * 0.04],
    [{ kind: 'ellipse', name: 's', cx: 0, cy: 0, rx: 1, ry: 2, rotation: 30 }, 2 * Math.PI],
    [{ kind: 'sector', name: 's', cx: 0, cy: 0, r: 1, start: 0, end: 90 }, Math.PI / 4],
    [{ kind: 'sector', name: 's', cx: 0, cy: 0, r: 1, start: 0, end: 180, r_inner: 0.5 }, (Math.PI / 2) * 0.75],
    [{ kind: 'polygon', name: 's', points: [[0, 0], [1, 0], [0, 1]] }, 0.5],
  ] as [Step, number][])('area of %o', (step, area) => {
    near(fillArea(fill(runSequence(model([step])), 's')), area);
  });

  it('a full ring is two loops (even-odd)', () => {
    const seq = runSequence(model([{ kind: 'sector', name: 'ring', cx: 0, cy: 0, r: 1, start: 0, end: 360, r_inner: 0.5 }]));
    const g = fill(seq, 'ring') as Extract<Geo, { op: 'fill' }>;
    expect(g.loops).toHaveLength(2);
    expect(objectAt(seq.objects, [0, 0], 0.01)).toBeNull(); // the inside is empty
    expect(objectAt(seq.objects, [0.75, 0], 0.01)).toBe('ring');
  });

  it('builds a surface from lines in any order and direction', () => {
    const steps: Step[] = [
      line('l1', [1, 0], [1, 1]),
      line('l2', [0, 0], [1, 0]),
      line('l3', [0, 0], [1, 1]),
      { kind: 'surface', name: 'tri', curves: ['l1', 'l3', 'l2'] },
    ];
    const seq = runSequence(model(steps));
    expect(seq.errors).toEqual([]);
    expect(seq.objects.map((o) => o.name)).toEqual(['tri']);
    expect(fillArea(fill(seq, 'tri'))).toBeCloseTo(0.5);
  });

  it('an open loop of curves is an error of that step', () => {
    const seq = runSequence(model([line('l', [0, 0], [1, 0], [1, 1]), { kind: 'surface', name: 's', curves: ['l'] }]));
    expect(seq.stepErrors.s).toMatch(/closed loop/);
  });

  it('booleans: painter order, consumed inputs, hit tests', () => {
    const steps: Step[] = [
      rect('box', 0, 0, 2, 2),
      disk('hole', 1, 1, 0.5),
      { kind: 'difference', name: 'air', objects: ['box'], tools: ['hole'] },
      rect('a', 3, 0, 1, 1),
      rect('b', 3.5, 0, 1, 1),
      { kind: 'intersection', name: 'i', objects: ['a', 'b'], keep: true },
    ];
    const seq = runSequence(model(steps));
    expect(seq.errors).toEqual([]);
    expect(seq.objects.map((o) => o.name)).toEqual(['air', 'a', 'b', 'i']);
    expect(objectAt(seq.objects, [1, 1], 0)).toBeNull(); // cut away
    expect(objectAt(seq.objects, [0.2, 0.2], 0)).toBe('air');
    expect(objectAt(seq.objects, [3.7, 0.5], 0)).toBe('i'); // the later object wins
    expect(objectAt(seq.objects, [3.2, 0.5], 0)).toBe('a');
  });

  it('transforms in place keep the name; with keep they add a copy', () => {
    const steps: Step[] = [
      rect('r', 1, 0, 1, 1),
      { kind: 'rotate', name: 'rot', objects: ['r'], cx: 0, cy: 0, angle: 90 },
      { kind: 'mirror', name: 'm', objects: ['r'], x: 0, y: 0, angle: 0, keep: true },
      { kind: 'scale', name: 's', objects: ['m'], cx: 0, cy: 0, factor: 2, factor_y: 1 },
    ];
    const seq = runSequence(model(steps));
    expect(seq.errors).toEqual([]);
    expect(seq.objects.map((o) => o.name)).toEqual(['r', 'm']);
    expect(objectAt(seq.objects, [-0.5, 1.5], 0)).toBe('r'); // rotated to [-1,0]×[1,2]
    expect(objectAt(seq.objects, [-1, -1.5], 0)).toBe('m'); // mirrored to y<0, x doubled
    expect(fillArea(fill(seq, 'm'))).toBeCloseTo(2);
  });

  it('arrays are one object of copies', () => {
    const seq = runSequence(
      model([
        rect('f', 0, 0, 0.1, 1),
        { kind: 'array', name: 'fingers', objects: ['f'], count: 4, dx: 0.3, dy: 0 },
        disk('c', 5, 0, 0.1),
        { kind: 'polar_array', name: 'ring', objects: ['c'], count: 4, cx: 4, cy: 0, angle: 90 },
      ]),
    );
    expect(seq.objects.map((o) => o.name)).toEqual(['fingers', 'ring']);
    expect(objectAt(seq.objects, [0.95, 0.5], 0)).toBe('fingers');
    expect(objectAt(seq.objects, [4, 1], 0)).toBe('ring');
    expect(seq.bounds.xmax).toBeCloseTo(5.1, 3);
  });

  it('curves and points are picked within a tolerance, before surfaces', () => {
    const seq = runSequence(model([rect('box', 0, 0, 1, 1), line('wire', [0.2, 0.5], [0.8, 0.5]), { kind: 'point', name: 'p', x: 0.5, y: 0.8 }]));
    expect(objectAt(seq.objects, [0.5, 0.51], 0.02)).toBe('wire');
    expect(objectAt(seq.objects, [0.5, 0.79], 0.02)).toBe('p');
    expect(objectAt(seq.objects, [0.5, 0.3], 0.02)).toBe('box');
  });

  it('the tree nests consumed inputs and the transforms applied to them', () => {
    const steps: Step[] = [
      rect('a', 0, 0, 1, 1),
      rect('b', 0.5, 0, 1, 1),
      { kind: 'move', name: 'mv', objects: ['b'], dx: 0.1, dy: 0 },
      { kind: 'union', name: 'u', objects: ['a', 'b'] },
      line('wire', [0, 0], [1, 1]),
      disk('c', 5, 5, 1),
    ];
    const seq = runSequence(model(steps, { holes: ['c'] }));
    const top = seq.tree.map((n) => [n.step.name, n.role]);
    expect(top).toEqual([['u', 'domain'], ['wire', 'curve'], ['c', 'hole']]);
    expect(seq.tree[0].children.map((n) => [n.step.name, n.role])).toEqual([['a', 'input'], ['b', 'input'], ['mv', 'transform']]);
  });

  it.each([
    ['duplicate names', [rect('a', 0, 0, 1, 1), rect('a', 1, 0, 1, 1)], {}],
    ['unknown object', [rect('a', 0, 0, 1, 1), { kind: 'union', name: 'u', objects: ['a', 'b'] }], {}],
    ['consumed object', [rect('a', 0, 0, 1, 1), rect('b', 0, 0, 1, 1), { kind: 'union', name: 'u', objects: ['a', 'b'] }, { kind: 'move', name: 'm', objects: ['a'], dx: 1, dy: 0 }], {}],
    ['mixed dimensions', [rect('a', 0, 0, 1, 1), line('l', [0, 0], [1, 1]), { kind: 'union', name: 'u', objects: ['a', 'l'] }], {}],
    ['lower-dimensional tool', [rect('a', 0, 0, 1, 1), line('l', [0, 0], [1, 1]), { kind: 'difference', name: 'd', objects: ['a'], tools: ['l'] }], {}],
    ['reserved name', [rect('outer', 0, 0, 1, 1)], {}],
    ['negative size', [rect('a', 0, 0, -1, 1)], {}],
    ['hole is a curve', [rect('a', 0, 0, 1, 1), line('l', [0, 0], [1, 1])], { holes: ['l'] }],
    ['nothing to mesh', [rect('a', 0, 0, 1, 1)], { holes: ['a'] }],
    ['selection named like a step', [rect('a', 0, 0, 1, 1)], { selections: [{ kind: 'points', name: 'a', points: [[0, 0]] }] }],
    ['mesh target typo', [rect('a', 0, 0, 1, 1)], { mesh: { ...EMPTY_MODEL.mesh, controls: [{ target: 'typo', size: 0.1 }] } }],
    ['structured boundary', [rect('a', 0, 0, 1, 1)], { mesh: { ...EMPTY_MODEL.mesh, controls: [{ target: 'outer', structured: true }] } }],
  ] as [string, Step[], Partial<FemModel>][])('rejects: %s (like the mesher)', (_, steps, extra) => {
    const seq = runSequence(model(steps, extra));
    expect(seq.errors.length + seq.meshErrors.length).toBeGreaterThan(0);
  });

  it('an interface a|b is a valid mesh target', () => {
    const m = model([rect('a', 0, 0, 1, 1), rect('b', 1, 0, 1, 1)], { mesh: { ...EMPTY_MODEL.mesh, controls: [{ target: 'a|b', size: 0.1 }] } });
    expect(runSequence(m).meshErrors).toEqual([]);
  });

  it('every step kind creates a valid default step', () => {
    const at = { x: 0, y: 0, h: 1 };
    for (const info of Object.values(STEPS)) {
      const base: Step[] = [rect('r1', 0, 0, 1, 1), rect('r2', 0.5, 0.5, 1, 1)];
      const curves: Step[] = [line('l1', [0, 0], [1, 0]), line('l2', [1, 0], [0, 1]), line('l3', [0, 1], [0, 0])];
      const selected = info.kind === 'surface' ? ['l1', 'l2', 'l3'] : info.kind === 'delete' ? ['l1'] : ['r1', 'r2'];
      const step = info.create(`${info.prefix}1`, at, info.dim === null || info.kind === 'surface' ? selected : []);
      const seq = runSequence(model([...base, ...curves, step]));
      expect([info.kind, seq.errors]).toEqual([info.kind, []]);
      expect(describeStep(step).length).toBeGreaterThan(0);
    }
  });

  it('the templates are valid sequences', () => {
    for (const t of TEMPLATES) expect([t.id, runSequence(t.model).errors]).toEqual([t.id, []]);
  });
});

describe('upgradeModel', () => {
  it('turns a version-1 model into steps and mesh controls, like the mesher', () => {
    const v1 = {
      version: 1,
      name: 'old',
      parameters: { w: 1 },
      shapes: [{ kind: 'rectangle', name: 'air', x: 0, y: 0, width: 'w', height: 1 }],
      holes: [],
      selections: [{ name: 'left', xmin: 0, ymin: 0, xmax: 0, ymax: 1 }],
      mesh: { size: 0.1, domain_sizes: { air: 0.05 }, boundary_sizes: { left: 0.01 }, order: 1, elements_per_circle: 16 },
      depth: 1,
      materials: {},
      boundary_conditions: [],
      sources: [],
    };
    const m = upgradeModel(v1)!;
    expect(m.version).toBe(2);
    expect(m.steps).toEqual(v1.shapes);
    expect(m.selections).toEqual([{ kind: 'box', name: 'left', xmin: 0, ymin: 0, xmax: 0, ymax: 1 }]);
    expect(m.mesh).toEqual({ size: 0.1, order: 1, elements_per_circle: 16, controls: [{ target: 'air', size: 0.05 }, { target: 'left', size: 0.01 }] });
    expect(m).not.toHaveProperty('shapes');
    expect(runSequence(m).errors).toEqual([]);
  });

  it('keeps version-2 models and rejects anything else', () => {
    expect(upgradeModel(TEMPLATES[0].model)).toBe(TEMPLATES[0].model);
    expect(upgradeModel({ elements: [] })).toBeNull();
    expect(upgradeModel(null)).toBeNull();
  });
});

describe('keeping and deleting', () => {
  const vertexX = (g: Geo): number[] =>
    g.op === 'fill' ? g.loops.flat().map((p) => p[0]) : g.op === 'group' ? g.items.flatMap(vertexX) : g.op === 'cut' || g.op === 'common' ? vertexX(g.a) : [];

  it('objects inside a combination follow its later moves (the tree highlights them in place)', () => {
    const steps: Step[] = [
      rect('a', 0, 0, 1, 1),
      disk('c', 1, 0.5, 0.5),
      { kind: 'union', name: 'u', objects: ['a', 'c'] },
      { kind: 'move', name: 'mv', objects: ['u'], dx: 10, dy: 0 },
    ];
    const seq = runSequence(model(steps));
    expect(Math.min(...vertexX(seq.created.a.geo))).toBeCloseTo(10);
    expect(Math.min(...vertexX(seq.created.c.geo))).toBeCloseTo(10.5);
    // the move is listed under the object it moves
    expect(seq.tree.map((n) => n.step.name)).toEqual(['u']);
    expect(seq.tree[0].children.map((n) => n.step.name)).toEqual(['a', 'c', 'mv']);
  });

  it('a union with inner edges is one object of its parts', () => {
    const seq = runSequence(model([rect('a', 0, 0, 1, 1), rect('b', 1, 0, 1, 1), { kind: 'union', name: 'u', objects: ['a', 'b'], interior: true }]));
    const g = seq.created.u.geo as Extract<Geo, { op: 'group' }>;
    expect(g.inner).toBe(true);
    expect(seq.objects.map((o) => o.name)).toEqual(['u']);
    expect(objectAt(seq.objects, [1.5, 0.5], 0)).toBe('u');
  });

  it('a Delete step removes objects; deleting it brings them back', () => {
    const steps: Step[] = [
      rect('box', 0, 0, 2, 2),
      disk('c', 1, 1, 0.5),
      { kind: 'difference', name: 'air', objects: ['box'], tools: ['c'], keep: true },
      { kind: 'delete', name: 'del1', objects: ['box'] },
    ];
    const seq = runSequence(model(steps));
    expect(seq.errors).toEqual([]);
    expect(seq.objects.map((o) => o.name)).toEqual(['c', 'air']);
    const del = seq.tree.find((n) => n.step.name === 'del1')!;
    expect(del.role).toBe('transform');
    expect(del.children.map((n) => n.step.name)).toEqual(['box']);
    expect(runSequence(model([...steps, { kind: 'move', name: 'm', objects: ['box'], dx: 1, dy: 0 }])).stepErrors.m).toMatch(/not an object/);
  });
});
