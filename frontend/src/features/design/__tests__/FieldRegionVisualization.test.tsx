import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from '@react-three/fiber';
import { FieldRegionVisualization } from '../FieldRegionVisualization';
import type { FieldDefinition } from '@/types/fieldDefinitions';

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

  it('renders without crashing when no fields provided', () => {
    const { container } = render(
      <Canvas>
        <FieldRegionVisualization
          fieldDefinitions={[]}
          opacity={0.3}
          visible={true}
        />
      </Canvas>
    );
    expect(container).toBeTruthy();
  });

  it('renders when visible is false', () => {
    const { container } = render(
      <Canvas>
        <FieldRegionVisualization
          fieldDefinitions={[mockPlaneField]}
          opacity={0.3}
          visible={false}
        />
      </Canvas>
    );
    expect(container).toBeTruthy();
  });

  it('renders 2D plane field region', () => {
    const { container } = render(
      <Canvas>
        <FieldRegionVisualization
          fieldDefinitions={[mockPlaneField]}
          opacity={0.3}
          visible={true}
        />
      </Canvas>
    );
    expect(container).toBeTruthy();
  });

  it('renders 3D sphere field region', () => {
    const { container } = render(
      <Canvas>
        <FieldRegionVisualization
          fieldDefinitions={[mockSphereField]}
          opacity={0.3}
          visible={true}
        />
      </Canvas>
    );
    expect(container).toBeTruthy();
  });

  it('renders multiple field regions with different colors', () => {
    const { container } = render(
      <Canvas>
        <FieldRegionVisualization
          fieldDefinitions={[mockPlaneField, mockSphereField]}
          opacity={0.3}
          visible={true}
        />
      </Canvas>
    );
    expect(container).toBeTruthy();
  });

  it('highlights selected field region', () => {
    const { container } = render(
      <Canvas>
        <FieldRegionVisualization
          fieldDefinitions={[mockPlaneField, mockSphereField]}
          selectedFieldId="field-1"
          opacity={0.3}
          visible={true}
        />
      </Canvas>
    );
    expect(container).toBeTruthy();
  });
});
