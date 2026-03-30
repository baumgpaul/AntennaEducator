/**
 * Tests for the TypeScript expression evaluator.
 *
 * Mirrors the backend test coverage in tests/unit/test_expressions.py.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  parseNumericOrExpression,
  evaluateVariableContext,
  evaluateVariableContextNumeric,
  formatValue,
  ExpressionError,
  type VariableDefinition,
} from '../expressionEvaluator';

// ---------------------------------------------------------------------------
// Basic arithmetic
// ---------------------------------------------------------------------------
describe('evaluateExpression — basic arithmetic', () => {
  it('evaluates integers', () => {
    expect(evaluateExpression('42')).toBe(42);
  });

  it('evaluates floats', () => {
    expect(evaluateExpression('3.14')).toBeCloseTo(3.14);
  });

  it('evaluates scientific notation', () => {
    expect(evaluateExpression('3e8')).toBe(3e8);
    expect(evaluateExpression('1.5e-3')).toBe(0.0015);
    expect(evaluateExpression('300e6')).toBe(300_000_000);
  });

  it('adds', () => {
    expect(evaluateExpression('2 + 3')).toBe(5);
  });

  it('subtracts', () => {
    expect(evaluateExpression('10 - 4')).toBe(6);
  });

  it('multiplies', () => {
    expect(evaluateExpression('6 * 7')).toBe(42);
  });

  it('divides', () => {
    expect(evaluateExpression('10 / 4')).toBe(2.5);
  });

  it('handles floor division', () => {
    expect(evaluateExpression('10 // 3')).toBe(3);
  });

  it('handles modulo', () => {
    expect(evaluateExpression('10 % 3')).toBe(1);
  });

  it('handles power', () => {
    expect(evaluateExpression('2 ** 10')).toBe(1024);
  });

  it('handles unary minus', () => {
    expect(evaluateExpression('-5')).toBe(-5);
    expect(evaluateExpression('--5')).toBe(5);
  });

  it('handles unary plus', () => {
    expect(evaluateExpression('+5')).toBe(5);
  });

  it('handles parentheses', () => {
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
  });

  it('respects operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('2 * 3 + 4')).toBe(10);
  });

  it('right-associates exponentiation', () => {
    expect(evaluateExpression('2 ** 3 ** 2')).toBe(512); // 2^(3^2) = 2^9
  });
});

// ---------------------------------------------------------------------------
// Math functions
// ---------------------------------------------------------------------------
describe('evaluateExpression — math functions', () => {
  it('sin', () => {
    expect(evaluateExpression('sin(0)')).toBe(0);
    expect(evaluateExpression('sin(pi / 2)')).toBeCloseTo(1);
  });

  it('cos', () => {
    expect(evaluateExpression('cos(0)')).toBe(1);
    expect(evaluateExpression('cos(pi)')).toBeCloseTo(-1);
  });

  it('tan', () => {
    expect(evaluateExpression('tan(0)')).toBe(0);
  });

  it('sqrt', () => {
    expect(evaluateExpression('sqrt(16)')).toBe(4);
    expect(evaluateExpression('sqrt(2)')).toBeCloseTo(Math.SQRT2);
  });

  it('abs', () => {
    expect(evaluateExpression('abs(-5)')).toBe(5);
    expect(evaluateExpression('abs(5)')).toBe(5);
  });

  it('log (natural)', () => {
    expect(evaluateExpression('log(1)')).toBe(0);
    expect(evaluateExpression('log(e)')).toBeCloseTo(1);
  });

  it('log10', () => {
    expect(evaluateExpression('log10(100)')).toBe(2);
  });

  it('log2', () => {
    expect(evaluateExpression('log2(8)')).toBe(3);
  });

  it('exp', () => {
    expect(evaluateExpression('exp(0)')).toBe(1);
    expect(evaluateExpression('exp(1)')).toBeCloseTo(Math.E);
  });

  it('ceil and floor', () => {
    expect(evaluateExpression('ceil(3.1)')).toBe(4);
    expect(evaluateExpression('floor(3.9)')).toBe(3);
  });

  it('round', () => {
    expect(evaluateExpression('round(3.5)')).toBe(4);
    expect(evaluateExpression('round(3.4)')).toBe(3);
  });

  it('min and max', () => {
    expect(evaluateExpression('min(3, 1, 2)')).toBe(1);
    expect(evaluateExpression('max(3, 1, 2)')).toBe(3);
  });

  it('asin, acos, atan', () => {
    expect(evaluateExpression('asin(1)')).toBeCloseTo(Math.PI / 2);
    expect(evaluateExpression('acos(1)')).toBe(0);
    expect(evaluateExpression('atan(0)')).toBe(0);
  });

  it('atan2', () => {
    expect(evaluateExpression('atan2(1, 1)')).toBeCloseTo(Math.PI / 4);
  });

  it('degrees and radians', () => {
    expect(evaluateExpression('degrees(pi)')).toBeCloseTo(180);
    expect(evaluateExpression('radians(180)')).toBeCloseTo(Math.PI);
  });
});

// ---------------------------------------------------------------------------
// Built-in constants
// ---------------------------------------------------------------------------
describe('evaluateExpression — built-in constants', () => {
  it('pi', () => {
    expect(evaluateExpression('pi')).toBeCloseTo(Math.PI);
  });

  it('e', () => {
    expect(evaluateExpression('e')).toBeCloseTo(Math.E);
  });

  it('C_0 (speed of light)', () => {
    expect(evaluateExpression('C_0')).toBe(299_792_458.0);
  });

  it('MU_0', () => {
    expect(evaluateExpression('MU_0')).toBeCloseTo(4e-7 * Math.PI);
  });

  it('EPSILON_0', () => {
    expect(evaluateExpression('EPSILON_0')).toBeTruthy();
    expect(evaluateExpression('EPSILON_0')).toBeCloseTo(8.854187817e-12, 18);
  });

  it('Z_0 (free space impedance)', () => {
    expect(evaluateExpression('Z_0')).toBeCloseTo(376.73, 1);
  });

  it('inf', () => {
    expect(evaluateExpression('inf')).toBe(Infinity);
  });

  it('uses constants in expressions', () => {
    // wavelength at 300 MHz
    const result = evaluateExpression('C_0 / 300e6');
    expect(result).toBeCloseTo(0.999, 2);
  });
});

// ---------------------------------------------------------------------------
// Variable resolution
// ---------------------------------------------------------------------------
describe('evaluateExpression — variable resolution', () => {
  it('resolves a simple variable', () => {
    expect(evaluateExpression('x', { x: 10 })).toBe(10);
  });

  it('resolves variables in expressions', () => {
    expect(evaluateExpression('2 * x + y', { x: 3, y: 7 })).toBe(13);
  });

  it('variables override built-in constants', () => {
    expect(evaluateExpression('pi', { pi: 42 })).toBe(42);
  });

  it('throws on undefined variable', () => {
    expect(() => evaluateExpression('unknown')).toThrow(ExpressionError);
    expect(() => evaluateExpression('unknown')).toThrow(/Unknown variable/);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe('evaluateExpression — errors', () => {
  it('throws on empty expression', () => {
    expect(() => evaluateExpression('')).toThrow(ExpressionError);
  });

  it('throws on syntax error (incomplete expr)', () => {
    expect(() => evaluateExpression('2 +')).toThrow(ExpressionError);
  });

  it('throws on unmatched parens', () => {
    expect(() => evaluateExpression('(2 + 3')).toThrow(ExpressionError);
  });

  it('throws on unknown function', () => {
    expect(() => evaluateExpression('foobar(1)')).toThrow(ExpressionError);
  });

  it('division by zero throws', () => {
    expect(() => evaluateExpression('1 / 0')).toThrow(ExpressionError);
  });

  it('throws on trailing characters', () => {
    expect(() => evaluateExpression('2 3')).toThrow(ExpressionError);
  });
});

// ---------------------------------------------------------------------------
// parseNumericOrExpression
// ---------------------------------------------------------------------------
describe('parseNumericOrExpression', () => {
  it('passes through numbers', () => {
    expect(parseNumericOrExpression(42)).toBe(42);
    expect(parseNumericOrExpression(3.14)).toBeCloseTo(3.14);
  });

  it('parses numeric strings', () => {
    expect(parseNumericOrExpression('42')).toBe(42);
    expect(parseNumericOrExpression('3.14')).toBeCloseTo(3.14);
  });

  it('evaluates expressions', () => {
    expect(parseNumericOrExpression('2 + 3')).toBe(5);
  });

  it('evaluates with variables', () => {
    expect(parseNumericOrExpression('wavelength / 2', { wavelength: 1 })).toBe(0.5);
  });

  it('throws on invalid expression', () => {
    expect(() => parseNumericOrExpression('invalid_var')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// evaluateVariableContext
// ---------------------------------------------------------------------------
describe('evaluateVariableContext', () => {
  it('evaluates simple numeric variables', () => {
    const vars: VariableDefinition[] = [
      { name: 'a', expression: '10' },
      { name: 'b', expression: '20' },
    ];
    const result = evaluateVariableContext(vars);
    expect(result).toEqual({ a: 10, b: 20 });
  });

  it('supports forward references (topological order)', () => {
    const vars: VariableDefinition[] = [
      { name: 'freq', expression: '300e6' },
      { name: 'wavelength', expression: 'C_0 / freq' },
    ];
    const result = evaluateVariableContext(vars);
    expect(result['freq']).toBe(300e6);
    expect(typeof result['wavelength']).toBe('number');
    expect(result['wavelength'] as number).toBeCloseTo(0.999, 2);
  });

  it('returns error string for invalid expressions', () => {
    const vars: VariableDefinition[] = [
      { name: 'good', expression: '42' },
      { name: 'bad', expression: 'undefined_var' },
    ];
    const result = evaluateVariableContext(vars);
    expect(result['good']).toBe(42);
    expect(typeof result['bad']).toBe('string');
  });

  it('propagates errors to dependents', () => {
    const vars: VariableDefinition[] = [
      { name: 'bad', expression: 'nope' },
      { name: 'dep', expression: 'bad + 1' },
    ];
    const result = evaluateVariableContext(vars);
    expect(typeof result['bad']).toBe('string');
    expect(typeof result['dep']).toBe('string');
  });

  it('handles empty list', () => {
    expect(evaluateVariableContext([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// evaluateVariableContextNumeric
// ---------------------------------------------------------------------------
describe('evaluateVariableContextNumeric', () => {
  it('only returns successfully evaluated variables', () => {
    const vars: VariableDefinition[] = [
      { name: 'a', expression: '10' },
      { name: 'b', expression: 'bad_ref' },
      { name: 'c', expression: 'a * 2' },
    ];
    const result = evaluateVariableContextNumeric(vars);
    expect(result).toEqual({ a: 10, c: 20 });
    expect(result['b']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// formatValue
// ---------------------------------------------------------------------------
describe('formatValue', () => {
  it('formats small numbers', () => {
    expect(formatValue(0.001)).toBe('0.001');
  });

  it('formats large numbers', () => {
    const formatted = formatValue(300_000_000);
    // formatValue uses toPrecision — may or may not use scientific notation
    expect(formatted).toBeTruthy();
    expect(Number(formatted)).toBe(300_000_000);
  });

  it('formats zero', () => {
    expect(formatValue(0)).toBe('0');
  });

  it('formats negative numbers', () => {
    const formatted = formatValue(-42);
    expect(formatted).toContain('-42');
  });

  it('formats very small numbers in scientific notation', () => {
    const formatted = formatValue(1e-12);
    expect(formatted).toContain('e');
  });
});

// ---------------------------------------------------------------------------
// Realistic antenna expressions
// ---------------------------------------------------------------------------
describe('realistic antenna expressions', () => {
  const antennaContext = { freq: 300e6 };

  it('half-wave dipole length', () => {
    const length = evaluateExpression('C_0 / freq / 2', antennaContext);
    expect(length).toBeCloseTo(0.4993, 3);
  });

  it('loop circumference = wavelength', () => {
    const radius = evaluateExpression('C_0 / freq / (2 * pi)', antennaContext);
    expect(radius).toBeCloseTo(0.1591, 3);
  });

  it('helix pitch = wavelength / 4', () => {
    const pitch = evaluateExpression('C_0 / freq / 4', antennaContext);
    expect(pitch).toBeCloseTo(0.2498, 3);
  });

  it('wire radius as fraction of wavelength', () => {
    const wireRadius = evaluateExpression('C_0 / freq / 1000', antennaContext);
    expect(wireRadius).toBeCloseTo(0.001, 3);
  });

  it('full variable context with defaults', () => {
    const vars: VariableDefinition[] = [
      { name: 'freq', expression: '300e6' },
      { name: 'wavelength', expression: 'C_0 / freq' },
      { name: 'arm_length', expression: 'wavelength / 4' },
    ];
    const ctx = evaluateVariableContextNumeric(vars);
    expect(ctx['freq']).toBe(300e6);
    expect(ctx['wavelength']).toBeCloseTo(0.999, 2);
    expect(ctx['arm_length']).toBeCloseTo(0.2498, 3);
  });
});
