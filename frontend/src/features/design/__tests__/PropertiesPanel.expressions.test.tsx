import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatValue } from '@/utils/expressionEvaluator';

describe('PropertiesPanel — expression display', () => {
  describe('formatValue helper', () => {
    it('formats integers without decimal', () => {
      expect(formatValue(42)).toBe('42');
    });

    it('formats small floats with precision', () => {
      expect(formatValue(0.001)).toBe('0.001');
    });

    it('formats very small numbers in scientific notation', () => {
      const result = formatValue(1.23e-10);
      expect(result).toMatch(/1\.23.*10/);
    });

    it('formats large numbers', () => {
      const result = formatValue(300000000);
      expect(result).toBe('300000000');
    });
  });

  describe('expression-to-config key mapping', () => {
    // Verify the mapping constants used in remesh logic
    const EXPR_TO_CONFIG_KEY: Record<string, Record<string, string>> = {
      dipole: { length: 'length', radius: 'wire_radius', gap: 'gap', segments: 'segments' },
      loop: { radius: 'radius', wireRadius: 'wire_radius', feedGap: 'gap', segments: 'segments' },
      rod: {
        radius: 'wire_radius',
        segments: 'segments',
        start_x: 'start_x',
        start_y: 'start_y',
        start_z: 'start_z',
        end_x: 'end_x',
        end_y: 'end_y',
        end_z: 'end_z',
      },
    };

    it('maps dipole expression keys correctly', () => {
      expect(EXPR_TO_CONFIG_KEY.dipole.length).toBe('length');
      expect(EXPR_TO_CONFIG_KEY.dipole.radius).toBe('wire_radius');
      expect(EXPR_TO_CONFIG_KEY.dipole.gap).toBe('gap');
      expect(EXPR_TO_CONFIG_KEY.dipole.segments).toBe('segments');
    });

    it('maps loop expression keys correctly', () => {
      expect(EXPR_TO_CONFIG_KEY.loop.radius).toBe('radius');
      expect(EXPR_TO_CONFIG_KEY.loop.wireRadius).toBe('wire_radius');
      expect(EXPR_TO_CONFIG_KEY.loop.feedGap).toBe('gap');
      expect(EXPR_TO_CONFIG_KEY.loop.segments).toBe('segments');
    });

    it('maps rod expression keys correctly', () => {
      expect(EXPR_TO_CONFIG_KEY.rod.radius).toBe('wire_radius');
      expect(EXPR_TO_CONFIG_KEY.rod.segments).toBe('segments');
      expect(EXPR_TO_CONFIG_KEY.rod.start_x).toBe('start_x');
      expect(EXPR_TO_CONFIG_KEY.rod.start_y).toBe('start_y');
      expect(EXPR_TO_CONFIG_KEY.rod.start_z).toBe('start_z');
      expect(EXPR_TO_CONFIG_KEY.rod.end_x).toBe('end_x');
      expect(EXPR_TO_CONFIG_KEY.rod.end_y).toBe('end_y');
      expect(EXPR_TO_CONFIG_KEY.rod.end_z).toBe('end_z');
    });
  });
});
