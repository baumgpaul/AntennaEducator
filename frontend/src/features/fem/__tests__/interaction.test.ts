import { describe, expect, it } from 'vitest';
import { EMPTY_MODEL, TEMPLATES, type FemModel, type Step } from '../model';
import { runSequence } from '../geometry/sequence';
import {
  directStep,
  dragHandle,
  drawnStep,
  handlesOf,
  moveObjects,
  nearestEdgePoint,
  niceStep,
  snap,
  snapTargets,
  tidy,
} from '../geometry/interaction';

const model = (steps: Step[]): FemModel => ({ ...EMPTY_MODEL, steps });
const rect: Step = { kind: 'rectangle', name: 'r', x: 0, y: 0, width: 2, height: 1 };

describe('snapping', () => {
  it('tidy numbers without float noise', () => {
    expect(tidy(0.30000000000000004, 0.001)).toBe(0.3);
    expect(tidy(0.01234, 0.005)).toBe(0.01);
    expect(tidy(-0.0001, 0.01)).toBe(0);
    expect(Object.is(tidy(-0.0001, 0.01), -0)).toBe(false);
    expect(niceStep(0.0031)).toBe(0.005);
  });

  it('prefers a nearby corner, else the grid', () => {
    const targets = snapTargets(model([rect]), runSequence(model([rect])));
    expect(targets).toContainEqual([2, 1]);
    expect(snap([1.97, 1.02], { grid: 0.5, targets, radius: 0.05 })).toEqual({ at: [2, 1], target: true });
    expect(snap([1.7, 0.6], { grid: 0.5, targets, radius: 0.05 })).toEqual({ at: [1.5, 0.5], target: false });
  });

  it('centres of round primitives are targets', () => {
    const m = model([{ kind: 'circle', name: 'c', cx: 3, cy: 4, r: 1 }]);
    expect(snapTargets(m, runSequence(m))).toContainEqual([3, 4]);
  });
});

describe('drawing', () => {
  it('a drag from corner to corner is a rectangle, in any direction', () => {
    expect(drawnStep('rectangle', [[2, 1], [0, 3]], 'r1')).toEqual({ kind: 'rectangle', name: 'r1', x: 0, y: 1, width: 2, height: 2 });
    expect(drawnStep('rectangle', [[0, 0], [0, 1]], 'r1')).toBeNull(); // no width
  });

  it('circle, ellipse, point', () => {
    expect(drawnStep('circle', [[1, 1], [4, 5]], 'c')).toMatchObject({ cx: 1, cy: 1, r: 5 });
    expect(drawnStep('ellipse', [[0, 0], [4, 2]], 'e')).toMatchObject({ cx: 2, cy: 1, rx: 2, ry: 1 });
    expect(drawnStep('point', [[0.5, 0.25]], 'p')).toEqual({ kind: 'point', name: 'p', x: 0.5, y: 0.25 });
  });

  it('arcs and sectors go counter-clockwise from the second click to the third', () => {
    expect(drawnStep('arc', [[0, 0], [1, 0], [0, 1]], 'a')).toMatchObject({ r: 1, start: 0, end: 90 });
    expect(drawnStep('sector', [[0, 0], [0, 1], [1, 0]], 's')).toMatchObject({ r: 1, start: 90, end: 360 });
  });

  it('point lists drop repeated clicks (a double-click) and need enough points', () => {
    expect(drawnStep('polygon', [[0, 0], [1, 0], [1, 1], [1, 1]], 'p')).toMatchObject({ points: [[0, 0], [1, 0], [1, 1]] });
    expect(drawnStep('polygon', [[0, 0], [1, 0], [1, 0]], 'p')).toBeNull();
    expect(drawnStep('polyline', [[0, 0], [1, 0]], 'l')).toMatchObject({ points: [[0, 0], [1, 0]] });
  });

  it('every drawn step is a valid sequence step', () => {
    const drawn = [
      drawnStep('rectangle', [[0, 0], [1, 1]], 'a'),
      drawnStep('sector', [[0, 0], [1, 0], [-1, 0.001]], 'b'),
      drawnStep('spline', [[0, 0], [1, 1], [2, 0]], 'c'),
    ] as Step[];
    expect(runSequence(model(drawn)).errors).toEqual([]);
  });
});

describe('handles', () => {
  it('a rectangle corner moves while the opposite corner stays', () => {
    const h = handlesOf(rect);
    expect(h.map((x) => x.at)).toEqual([[0, 0], [2, 0], [2, 1], [0, 1]]);
    expect(dragHandle(rect, 'c2', [3, 4])).toMatchObject({ x: 0, y: 0, width: 3, height: 4 });
    expect(dragHandle(rect, 'c0', [3, 2])).toMatchObject({ x: 2, y: 1, width: 1, height: 1 }); // dragged past: flips
    expect(dragHandle(rect, 'c2', [0, 1])).toBe(rect); // degenerate: unchanged
  });

  it('radius, axes, arc ends and vertices', () => {
    const c: Step = { kind: 'circle', name: 'c', cx: 0, cy: 0, r: 1 };
    expect(dragHandle(c, 'r', [0, 3])).toMatchObject({ r: 3 });
    const arc: Step = { kind: 'arc', name: 'a', cx: 0, cy: 0, r: 1, start: 0, end: 90 };
    expect(dragHandle(arc, 'end', [-2, 0])).toMatchObject({ r: 2, start: 0, end: 180 });
    const poly: Step = { kind: 'polygon', name: 'p', points: [[0, 0], [1, 0], [0, 1]] };
    expect(dragHandle(poly, 'p1', [2, 0])).toMatchObject({ points: [[0, 0], [2, 0], [0, 1]] });
  });

  it('no handles for numbers given as expressions or rotated shapes', () => {
    expect(handlesOf({ ...rect, width: '2*w' } as Step)).toEqual([]);
    expect(handlesOf({ ...rect, rotation: 30 } as Step)).toEqual([]);
    expect(handlesOf({ kind: 'polygon', name: 'p', points: [[0, 0], ['a', 0], [0, 1]] })).toHaveLength(2);
  });
});

describe('moving', () => {
  it('a plain primitive gets new numbers', () => {
    const m = moveObjects(model([rect]), ['r'], 0.5, -1);
    expect(m.steps).toEqual([{ ...rect, x: 0.5, y: -1 }]);
    // the coax's inner conductor: centre in numbers (radius a parameter) → edited directly
    const coax = TEMPLATES.find((t) => t.id === 'coax')!.model;
    expect(moveObjects(coax, ['inner'], 0.001, 0).steps[1]).toMatchObject({ cx: 0.001, cy: 0, r: 'a' });
  });

  it('parametric positions and boolean results get a Move step, extended by the next drag', () => {
    const plate = TEMPLATES.find((t) => t.id === 'plate-capacitor')!.model; // top at x = -w/2
    let m = moveObjects(plate, ['top'], 0.001, 0);
    expect(m.steps.at(-1)).toEqual({ kind: 'move', name: 'mov1', objects: ['top'], dx: 0.001, dy: 0 });
    expect(m.steps[2]).toEqual(plate.steps[2]); // the expressions stay
    m = moveObjects(m, ['top'], 0.001, 0.002);
    expect(m.steps).toHaveLength(plate.steps.length + 1);
    expect(m.steps.at(-1)).toMatchObject({ dx: 0.002, dy: 0.002 });
    expect(runSequence(m).errors).toEqual([]);
  });

  it('a transformed primitive is not edited directly', () => {
    const m = model([rect, { kind: 'rotate', name: 'rot', objects: ['r'], cx: 0, cy: 0, angle: 90 }]);
    expect(directStep(m, 'r')).toBeNull();
    expect(moveObjects(m, ['r'], 1, 0).steps.at(-1)).toMatchObject({ kind: 'move', objects: ['r'] });
  });
});

describe('picking edges', () => {
  it('finds the nearest point on an edge within the tolerance', () => {
    const seq = runSequence(model([rect]));
    expect(nearestEdgePoint(seq, [1, 0.02], 0.05)).toEqual([1, 0]);
    expect(nearestEdgePoint(seq, [1, 0.5], 0.05)).toBeNull();
  });
});
