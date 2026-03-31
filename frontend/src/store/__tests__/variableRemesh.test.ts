import { describe, it, expect } from 'vitest';
import {
  BUILTIN_CONSTANTS,
  parseNumericOrExpression,
  evaluateVariableContextNumeric,
} from '@/utils/expressionEvaluator';
import type { VariableDefinition } from '@/utils/expressionEvaluator';

/**
 * Tests for the variable-change remesh detection logic.
 * This logic lives in DesignPage useEffect but is tested here
 * against the pure expression evaluation functions.
 */

const EXPR_MAP: Record<string, Record<string, string>> = {
  dipole: { length: 'length', radius: 'wire_radius', gap: 'gap' },
  loop: { radius: 'radius', wireRadius: 'wire_radius', feedGap: 'gap' },
  rod: { radius: 'wire_radius' },
};

/** Simulate the DesignPage remesh detection logic. */
function detectChanges(
  elementType: string,
  currentConfig: Record<string, any>,
  expressions: Record<string, string>,
  variables: VariableDefinition[]
): { changed: boolean; resolved: Record<string, number> } {
  const varCtx = {
    ...BUILTIN_CONSTANTS,
    ...evaluateVariableContextNumeric(variables),
  };
  const mapping = EXPR_MAP[elementType] || {};
  const resolved: Record<string, number> = {};
  let changed = false;

  for (const [key, expr] of Object.entries(expressions)) {
    try {
      const newVal = parseNumericOrExpression(expr, varCtx);
      resolved[key] = newVal;
      const configKey = mapping[key];
      if (configKey) {
          const currentVal = currentConfig[configKey];
        if (Math.abs(newVal - currentVal) > 1e-15) {
          changed = true;
        }
      }
    } catch {
      // skip
    }
  }
  return { changed, resolved };
}

describe('Variable-change remesh detection', () => {
  describe('dipole with frequency-dependent expressions', () => {
    const defaultVars: VariableDefinition[] = [
      { name: 'freq', expression: '300e6', unit: 'Hz', description: 'Frequency' },
      { name: 'wavelength', expression: 'C_0 / freq', unit: 'm', description: 'Wavelength' },
    ];

    // wavelength at 300 MHz = 0.999308... m
    const wavelength300 = 299792458 / 300e6;

    it('detects no change when variables match current config', () => {
      const config = {
        length: wavelength300 / 2,
        wire_radius: 0.001,
        gap: 0.01,
      };
      const expressions = {
        length: 'wavelength / 2',
        radius: '0.001',
        gap: '0.01',
      };
      const result = detectChanges('dipole', config, expressions, defaultVars);
      expect(result.changed).toBe(false);
    });

    it('detects change when frequency changes', () => {
      const config = {
        length: wavelength300 / 2,
        wire_radius: 0.001,
        gap: 0.01,
      };
      const expressions = {
        length: 'wavelength / 2',
        radius: '0.001',
        gap: '0.01',
      };
      const newVars: VariableDefinition[] = [
        { name: 'freq', expression: '600e6', unit: 'Hz', description: 'Frequency' },
        { name: 'wavelength', expression: 'C_0 / freq', unit: 'm', description: 'Wavelength' },
      ];
      const result = detectChanges('dipole', config, expressions, newVars);
      expect(result.changed).toBe(true);
      expect(result.resolved.length).toBeCloseTo(299792458 / 600e6 / 2, 6);
    });

    it('handles plain numeric expressions (no change)', () => {
      const config = { length: 0.5, wire_radius: 0.001, gap: 0.01 };
      const expressions = { length: '0.5', radius: '0.001', gap: '0.01' };
      const result = detectChanges('dipole', config, expressions, defaultVars);
      expect(result.changed).toBe(false);
    });
  });

  describe('loop with expression changes', () => {
    it('detects change when loop radius expression changes value', () => {
      const vars300: VariableDefinition[] = [
        { name: 'freq', expression: '300e6', unit: 'Hz', description: '' },
        { name: 'wavelength', expression: 'C_0 / freq', unit: 'm', description: '' },
      ];
      const wavelength300 = 299792458 / 300e6;
      const config = {
        radius: wavelength300 / (2 * Math.PI),
        wire_radius: 0.001,
        gap: 0.005,
      };
      const expressions = {
        radius: 'wavelength / (2 * pi)',
        wireRadius: '0.001',
        feedGap: '0.005',
      };
      // Same frequency — no change
      let result = detectChanges('loop', config, expressions, vars300);
      expect(result.changed).toBe(false);

      // Different frequency — change
      const vars600: VariableDefinition[] = [
        { name: 'freq', expression: '600e6', unit: 'Hz', description: '' },
        { name: 'wavelength', expression: 'C_0 / freq', unit: 'm', description: '' },
      ];
      result = detectChanges('loop', config, expressions, vars600);
      expect(result.changed).toBe(true);
    });
  });

  describe('rod expression changes', () => {
    it('detects change when rod radius expression changes', () => {
      const config = { wire_radius: 0.001 };
      const expressions = { radius: '0.002' };
      const result = detectChanges('rod', config, expressions, []);
      expect(result.changed).toBe(true);
    });
  });

  describe('error handling', () => {
    it('skips elements with failing expressions gracefully', () => {
      const config = { length: 0.5, wire_radius: 0.001, gap: 0.01 };
      const expressions = {
        length: 'undefined_var / 2',
        radius: '0.001',
        gap: '0.01',
      };
      // undefined_var not in context — should not crash, should not detect change
      // because the failing expression is skipped
      const result = detectChanges('dipole', config, expressions, []);
      expect(result.changed).toBe(false);
      expect(result.resolved.length).toBeUndefined();
      expect(result.resolved.radius).toBe(0.001);
    });
  });
});
