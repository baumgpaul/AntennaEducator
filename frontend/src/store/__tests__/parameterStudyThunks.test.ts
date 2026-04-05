/**
 * Tests for parameter study engine helpers.
 *
 * Tests the pure functions (buildOverriddenContext, resolveElementExpressions)
 * that power the parameter study loop.
 */
import { describe, it, expect } from 'vitest';
import {
  buildOverriddenContext,
  resolveElementExpressions,
} from '@/store/parameterStudyThunks';
import type { VariableDefinition } from '@/utils/expressionEvaluator';

// ============================================================================
// buildOverriddenContext
// ============================================================================

describe('buildOverriddenContext', () => {
  const defaultVars: VariableDefinition[] = [
    { name: 'freq', expression: '300e6', unit: 'Hz' },
    { name: 'wavelength', expression: 'C_0 / freq', unit: 'm' },
  ];

  it('evaluates default variables normally', () => {
    const ctx = buildOverriddenContext(defaultVars, {});
    expect(ctx.freq).toBeCloseTo(300e6);
    // C_0 ≈ 299792458 → wavelength ≈ 0.999...
    expect(ctx.wavelength).toBeCloseTo(299792458 / 300e6, 3);
  });

  it('overrides a variable value', () => {
    const ctx = buildOverriddenContext(defaultVars, { freq: 500e6 });
    expect(ctx.freq).toBeCloseTo(500e6);
    // wavelength should re-evaluate with overridden freq
    expect(ctx.wavelength).toBeCloseTo(299792458 / 500e6, 3);
  });

  it('propagates overrides to dependent variables', () => {
    const vars: VariableDefinition[] = [
      { name: 'freq', expression: '300e6' },
      { name: 'wavelength', expression: 'C_0 / freq' },
      { name: 'half_wave', expression: 'wavelength / 2' },
    ];
    const ctx = buildOverriddenContext(vars, { freq: 150e6 });
    expect(ctx.freq).toBeCloseTo(150e6);
    const expectedWl = 299792458 / 150e6;
    expect(ctx.wavelength).toBeCloseTo(expectedWl, 3);
    expect(ctx.half_wave).toBeCloseTo(expectedWl / 2, 3);
  });

  it('handles multiple overrides', () => {
    const vars: VariableDefinition[] = [
      { name: 'a', expression: '10' },
      { name: 'b', expression: '20' },
      { name: 'c', expression: 'a + b' },
    ];
    const ctx = buildOverriddenContext(vars, { a: 100, b: 200 });
    expect(ctx.a).toBe(100);
    expect(ctx.b).toBe(200);
    expect(ctx.c).toBe(300);
  });

  it('skips variables that fail to evaluate', () => {
    const vars: VariableDefinition[] = [
      { name: 'ok', expression: '42' },
      { name: 'bad', expression: 'undefined_var + 1' },
    ];
    const ctx = buildOverriddenContext(vars, {});
    expect(ctx.ok).toBe(42);
    expect(ctx.bad).toBeUndefined();
  });
});

// ============================================================================
// resolveElementExpressions
// ============================================================================

describe('resolveElementExpressions', () => {
  it('evaluates expressions against the provided context', () => {
    const expressions = {
      length: 'wavelength / 2',
      radius: '0.001',
    };
    const ctx = { freq: 300e6, wavelength: 1.0 };
    const resolved = resolveElementExpressions(expressions, ctx);
    expect(resolved.length).toBeCloseTo(0.5);
    expect(resolved.radius).toBeCloseTo(0.001);
  });

  it('uses context variables in expressions', () => {
    const expressions = { gap: 'wavelength * 0.01' };
    const ctx = { wavelength: 2.0 };
    expect(resolveElementExpressions(expressions, ctx).gap).toBeCloseTo(0.02);
  });

  it('skips expressions that fail', () => {
    const expressions = {
      length: 'wavelength / 2',
      bad: 'missing_var * 3',
    };
    const ctx = { wavelength: 1.0 };
    const resolved = resolveElementExpressions(expressions, ctx);
    expect(resolved.length).toBeCloseTo(0.5);
    expect(resolved.bad).toBeUndefined();
  });

  it('returns empty object for empty expressions', () => {
    expect(resolveElementExpressions({}, {})).toEqual({});
  });
});
