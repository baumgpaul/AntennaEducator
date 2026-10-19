import { describe, it, expect } from 'vitest';
import { evaluateParameters } from '../expressions';
import { EPSILON_0, TEMPLATES } from '../model';
import { evaluateShapes } from '../views/geometryDraw';

describe('FEM templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s draws and is complete', (_, t) => {
    const drawn = evaluateShapes(t.model);
    expect(drawn.error).toBeUndefined();
    expect(drawn.shapes).toHaveLength(t.model.shapes.length);
    const domains = t.model.shapes.map((s) => s.name).filter((n) => !t.model.holes.includes(n));
    domains.forEach((d) => expect(t.model.materials[d]).toBeDefined());
    expect(t.model.boundary_conditions.some((bc) => bc.type === 'ground')).toBe(true);
  });

  it('coax reference is 2πε/ln(b/a)', () => {
    const t = TEMPLATES.find((x) => x.id === 'coax')!;
    const p = evaluateParameters(t.model.parameters);
    const expected = (2 * Math.PI * EPSILON_0 * 2.1) / Math.log(0.0017 / 0.0005);
    expect(t.analytic!.value(p, t.model) / expected).toBeCloseTo(1, 12);
  });
});

describe('femError', () => {
  it('says where a validation error is', async () => {
    const { femError } = await import('../api');
    const error = {
      details: { detail: [{ loc: ['body', 'geometry', 'shapes', 0, 'rectangle', 'width'], msg: 'Input should be a valid number' }] },
    };
    expect(femError(error).message).toBe('geometry → shapes → 0 → width: Input should be a valid number');
    expect(femError({ details: { detail: { message: 'No ground', issues: [{ step: 'physics' }] } } }).issues).toHaveLength(1);
  });
});
