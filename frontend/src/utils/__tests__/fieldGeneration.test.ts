/**
 * Field Generation Tests
 * TDD tests for 1D field sampling (line and arc)
 */

import { describe, it, expect } from 'vitest';
import { generateObservationPoints } from '../fieldGeneration';
import type { FieldDefinition1D } from '@/types/fieldDefinitions';

describe('fieldGeneration', () => {
  describe('1D Line sampling', () => {
    it('should generate correct number of points for a line', () => {
      const lineDef: FieldDefinition1D = {
        id: 'test-line-1',
        type: '1D',
        shape: 'line',
        startPoint: [0, 0, 0],
        endPoint: [100, 0, 0],
        numPoints: 11,
        fieldType: 'E',
      };

      const points = generateObservationPoints(lineDef);
      expect(points).toHaveLength(11);
    });

    it('should generate points along a line from start to end (converted to meters)', () => {
      const lineDef: FieldDefinition1D = {
        id: 'test-line-2',
        type: '1D',
        shape: 'line',
        startPoint: [0, 0, 0],      // mm
        endPoint: [100, 0, 0],      // mm -> 0.1m
        numPoints: 3,
        fieldType: 'E',
      };

      const points = generateObservationPoints(lineDef);

      // First point should be at start (converted to m)
      expect(points[0][0]).toBeCloseTo(0.0);
      expect(points[0][1]).toBeCloseTo(0.0);
      expect(points[0][2]).toBeCloseTo(0.0);

      // Middle point should be at midpoint
      expect(points[1][0]).toBeCloseTo(0.05);
      expect(points[1][1]).toBeCloseTo(0.0);
      expect(points[1][2]).toBeCloseTo(0.0);

      // Last point should be at end
      expect(points[2][0]).toBeCloseTo(0.1);
      expect(points[2][1]).toBeCloseTo(0.0);
      expect(points[2][2]).toBeCloseTo(0.0);
    });

    it('should handle diagonal lines in 3D', () => {
      const lineDef: FieldDefinition1D = {
        id: 'test-line-3',
        type: '1D',
        shape: 'line',
        startPoint: [0, 0, 0],
        endPoint: [100, 100, 100],
        numPoints: 2,
        fieldType: 'H',
      };

      const points = generateObservationPoints(lineDef);

      // Start point
      expect(points[0]).toEqual([0, 0, 0]);

      // End point (converted to meters)
      expect(points[1][0]).toBeCloseTo(0.1);
      expect(points[1][1]).toBeCloseTo(0.1);
      expect(points[1][2]).toBeCloseTo(0.1);
    });

    it('should handle negative coordinates', () => {
      const lineDef: FieldDefinition1D = {
        id: 'test-line-4',
        type: '1D',
        shape: 'line',
        startPoint: [-50, -50, 0],
        endPoint: [50, 50, 0],
        numPoints: 3,
        fieldType: 'E',
      };

      const points = generateObservationPoints(lineDef);

      expect(points[0][0]).toBeCloseTo(-0.05);
      expect(points[0][1]).toBeCloseTo(-0.05);
      expect(points[1][0]).toBeCloseTo(0);
      expect(points[1][1]).toBeCloseTo(0);
      expect(points[2][0]).toBeCloseTo(0.05);
      expect(points[2][1]).toBeCloseTo(0.05);
    });
  });

  describe('1D Arc sampling', () => {
    it('should generate correct number of points for an arc', () => {
      const arcDef: FieldDefinition1D = {
        id: 'test-arc-1',
        type: '1D',
        shape: 'arc',
        centerPoint: [0, 0, 0],
        axis1: [1, 0, 0],
        axis2: [0, 1, 0],
        radiusA: 100,
        radiusB: 100,
        startAngle: 0,
        endAngle: 90,
        numPoints: 10,
        fieldType: 'E',
      };

      const points = generateObservationPoints(arcDef);
      expect(points).toHaveLength(10);
    });

    it('should generate points on a circular arc in XY plane', () => {
      const arcDef: FieldDefinition1D = {
        id: 'test-arc-2',
        type: '1D',
        shape: 'arc',
        centerPoint: [0, 0, 0],
        axis1: [1, 0, 0],
        axis2: [0, 1, 0],
        radiusA: 100,   // mm -> 0.1m
        radiusB: 100,
        startAngle: 0,
        endAngle: 90,
        numPoints: 3,
        fieldType: 'E',
      };

      const points = generateObservationPoints(arcDef);

      // First point at 0° -> (0.1, 0, 0)
      expect(points[0][0]).toBeCloseTo(0.1);
      expect(points[0][1]).toBeCloseTo(0);
      expect(points[0][2]).toBeCloseTo(0);

      // Middle point at 45° -> (0.1*cos45, 0.1*sin45, 0) ≈ (0.0707, 0.0707, 0)
      expect(points[1][0]).toBeCloseTo(0.1 * Math.cos(Math.PI / 4));
      expect(points[1][1]).toBeCloseTo(0.1 * Math.sin(Math.PI / 4));
      expect(points[1][2]).toBeCloseTo(0);

      // Last point at 90° -> (0, 0.1, 0)
      expect(points[2][0]).toBeCloseTo(0);
      expect(points[2][1]).toBeCloseTo(0.1);
      expect(points[2][2]).toBeCloseTo(0);
    });

    it('should generate elliptical arc with different radii', () => {
      const arcDef: FieldDefinition1D = {
        id: 'test-arc-3',
        type: '1D',
        shape: 'arc',
        centerPoint: [0, 0, 0],
        axis1: [1, 0, 0],
        axis2: [0, 1, 0],
        radiusA: 200,   // mm -> 0.2m along axis1
        radiusB: 100,   // mm -> 0.1m along axis2
        startAngle: 0,
        endAngle: 90,
        numPoints: 3,
        fieldType: 'E',
      };

      const points = generateObservationPoints(arcDef);

      // First point at 0° -> (0.2, 0, 0)
      expect(points[0][0]).toBeCloseTo(0.2);
      expect(points[0][1]).toBeCloseTo(0);

      // Last point at 90° -> (0, 0.1, 0)
      expect(points[2][0]).toBeCloseTo(0);
      expect(points[2][1]).toBeCloseTo(0.1);
    });

    it('should handle arc with center offset', () => {
      const arcDef: FieldDefinition1D = {
        id: 'test-arc-4',
        type: '1D',
        shape: 'arc',
        centerPoint: [100, 100, 50],  // mm -> (0.1, 0.1, 0.05)m
        axis1: [1, 0, 0],
        axis2: [0, 1, 0],
        radiusA: 50,    // mm -> 0.05m
        radiusB: 50,
        startAngle: 0,
        endAngle: 180,
        numPoints: 3,
        fieldType: 'H',
      };

      const points = generateObservationPoints(arcDef);

      // First point at 0°: center + radius*axis1 = (0.15, 0.1, 0.05)
      expect(points[0][0]).toBeCloseTo(0.15);
      expect(points[0][1]).toBeCloseTo(0.1);
      expect(points[0][2]).toBeCloseTo(0.05);

      // Last point at 180°: center - radius*axis1 = (0.05, 0.1, 0.05)
      expect(points[2][0]).toBeCloseTo(0.05);
      expect(points[2][1]).toBeCloseTo(0.1);
      expect(points[2][2]).toBeCloseTo(0.05);
    });

    it('should handle full 360° arc', () => {
      const arcDef: FieldDefinition1D = {
        id: 'test-arc-5',
        type: '1D',
        shape: 'arc',
        centerPoint: [0, 0, 0],
        axis1: [1, 0, 0],
        axis2: [0, 1, 0],
        radiusA: 100,
        radiusB: 100,
        startAngle: 0,
        endAngle: 360,
        numPoints: 5,
        fieldType: 'E',
      };

      const points = generateObservationPoints(arcDef);
      expect(points).toHaveLength(5);

      // First and last points should be the same (full circle)
      expect(points[0][0]).toBeCloseTo(points[4][0]);
      expect(points[0][1]).toBeCloseTo(points[4][1]);
    });

    it('should handle arc in XZ plane', () => {
      const arcDef: FieldDefinition1D = {
        id: 'test-arc-6',
        type: '1D',
        shape: 'arc',
        centerPoint: [0, 0, 0],
        axis1: [1, 0, 0],
        axis2: [0, 0, 1],
        radiusA: 100,
        radiusB: 100,
        startAngle: 0,
        endAngle: 90,
        numPoints: 2,
        fieldType: 'E',
      };

      const points = generateObservationPoints(arcDef);

      // First point at 0° -> (0.1, 0, 0)
      expect(points[0][0]).toBeCloseTo(0.1);
      expect(points[0][1]).toBeCloseTo(0);
      expect(points[0][2]).toBeCloseTo(0);

      // Last point at 90° -> (0, 0, 0.1)
      expect(points[1][0]).toBeCloseTo(0);
      expect(points[1][1]).toBeCloseTo(0);
      expect(points[1][2]).toBeCloseTo(0.1);
    });

    it('should use preset axes when normalPreset is specified', () => {
      const arcDef: FieldDefinition1D = {
        id: 'test-arc-7',
        type: '1D',
        shape: 'arc',
        centerPoint: [0, 0, 0],
        normalPreset: 'XY',  // axis1=[1,0,0], axis2=[0,1,0]
        radiusA: 100,
        radiusB: 100,
        startAngle: 0,
        endAngle: 90,
        numPoints: 2,
        fieldType: 'E',
      };

      const points = generateObservationPoints(arcDef);

      // Same as explicit XY axes
      expect(points[0][0]).toBeCloseTo(0.1);
      expect(points[0][1]).toBeCloseTo(0);
      expect(points[1][0]).toBeCloseTo(0);
      expect(points[1][1]).toBeCloseTo(0.1);
    });
  });
});
