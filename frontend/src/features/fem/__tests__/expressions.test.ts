import { describe, it, expect } from 'vitest';
import { dependsOnSpace, evaluate, evaluateParameters, ExpressionError, parseExprInput } from '../expressions';

describe('expressions (same language as the backend)', () => {
  it('evaluates arithmetic with Python precedence', () => {
    expect(evaluate('1 + 2*3', {})).toBe(7);
    expect(evaluate('-2**2', {})).toBe(-4); // as in Python: -(2**2)
    expect(evaluate('2**-1', {})).toBe(0.5);
    expect(evaluate('2^3', {})).toBe(8);
    expect(evaluate('(1+2)*3/4', {})).toBe(2.25);
    expect(evaluate('1e-3*2', {})).toBeCloseTo(0.002);
    expect(evaluate(0.5, {})).toBe(0.5);
  });

  it('knows parameters, pi and the math functions', () => {
    const p = evaluateParameters({ d: 0.01, gap: '2*d', r: 'sqrt(gap**2 + d**2)' });
    expect(p.gap).toBeCloseTo(0.02);
    expect(p.r).toBeCloseTo(Math.sqrt(5) * 0.01);
    expect(evaluate('pi*r**2', p)).toBeCloseTo(Math.PI * p.r ** 2);
    expect(evaluate('max(1, 3, 2) + atan2(0, 1)', {})).toBe(3);
  });

  it.each(['unknown + 1', '1 +', '(1', 'alert(1)', 'a.b', '1 2', ''])('rejects "%s"', (expr) => {
    expect(() => evaluate(expr, { a: 1 })).toThrow(ExpressionError);
  });

  it('parameters only see the ones defined before them', () => {
    expect(() => evaluateParameters({ a: 'b', b: 1 })).toThrow(ExpressionError);
  });

  it('detects space-dependent values', () => {
    expect(dependsOnSpace('E0*x')).toBe(true);
    expect(dependsOnSpace('max_v')).toBe(false);
    expect(dependsOnSpace(3)).toBe(false);
  });

  it('reads typed input: numbers (also with a decimal comma) or expressions', () => {
    expect(parseExprInput('1.5')).toBe(1.5);
    expect(parseExprInput('1,5')).toBe(1.5);
    expect(parseExprInput('-0,25')).toBe(-0.25);
    expect(parseExprInput('max(1,5)')).toBe('max(1,5)'); // a list stays an expression
    expect(parseExprInput('2*d')).toBe('2*d');
    expect(parseExprInput('')).toBe('');
  });
});
