import { describe, it, expect, vi } from 'vitest';
import { FieldRegionVisualization } from '../FieldRegionVisualization';
import type { FieldDefinition } from '@/types/fieldDefinitions';

// Mock Three.js — jsdom has no WebGL support
vi.mock('three', () => {
  const actual = {
    PlaneGeometry: vi.fn(),
    CircleGeometry: vi.fn(),
    SphereGeometry: vi.fn(),
    BoxGeometry: vi.fn(),
    EdgesGeometry: vi.fn(),
    WireframeGeometry: vi.fn(),
    Quaternion: vi.fn(() => ({ setFromUnitVectors: vi.fn() })),
    Vector3: vi.fn(() => ({ normalize: vi.fn().mockReturnThis() })),
    DoubleSide: 2,
    AdditiveBlending: 2,
  };
  return { ...actual, default: actual };
});

// We test that the component renders (returns non-null JSX) or returns null
// based on visibility and field definitions, without actually rendering R3F elements.

describe('FieldRegionVisualization', () => {
  const mockPlaneField: FieldDefinition = {
    id: 'field-1',
    type: '2D',
    shape: 'plane',
    centerPoint: [0, 0, 50],
    dimensions: {
      width: 100,
      height: 100,
    },
    normalPreset: 'XY',
    sampling: {
      x: 20,
      y: 20,
    },
    farField: false,
    fieldType: 'E',
  };

  const mockSphereField: FieldDefinition = {
    id: 'field-2',
    type: '3D',
    shape: 'sphere',
    centerPoint: [0, 0, 100],
    sphereRadius: 50,
    sampling: {
      radial: 10,
      angular: 20,
    },
    farField: false,
    fieldType: 'poynting',
  };

  it('returns null when no fields provided', () => {
    const result = FieldRegionVisualization({
      fieldDefinitions: [],
      visible: true,
    });
    expect(result).toBeNull();
  });

  it('returns null when visible is false', () => {
    const result = FieldRegionVisualization({
      fieldDefinitions: [mockPlaneField],
      visible: false,
    });
    expect(result).toBeNull();
  });

  it('returns JSX when visible with plane field', () => {
    const result = FieldRegionVisualization({
      fieldDefinitions: [mockPlaneField],
      visible: true,
    });
    expect(result).not.toBeNull();
  });

  it('returns JSX when visible with sphere field', () => {
    const result = FieldRegionVisualization({
      fieldDefinitions: [mockSphereField],
      visible: true,
    });
    expect(result).not.toBeNull();
  });

  it('returns JSX with multiple fields', () => {
    const result = FieldRegionVisualization({
      fieldDefinitions: [mockPlaneField, mockSphereField],
      visible: true,
    });
    expect(result).not.toBeNull();
  });

  it('accepts selectedFieldId prop', () => {
    const result = FieldRegionVisualization({
      fieldDefinitions: [mockPlaneField, mockSphereField],
      selectedFieldId: 'field-1',
      visible: true,
    });
    expect(result).not.toBeNull();
  });
});
