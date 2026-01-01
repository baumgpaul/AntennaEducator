import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PostprocessingTab from '../PostprocessingTab';
import type { AntennaElement } from '@/types/models';
import type { FieldDefinition } from '@/types/fieldDefinitions';

const makeElement = (id: string, name: string, type: AntennaElement['type']): AntennaElement => ({
  id,
  name,
  type,
  config: {} as any,
  position: [0, 0, 0] as any,
  rotation: [0, 0, 0] as any,
  mesh: { nodes: [], edges: [], radii: [], metadata: {} } as any,
  visible: true,
  locked: false,
});

const makeField = (id: string, type: FieldDefinition['type'], shape: FieldDefinition['shape']): FieldDefinition => ({
  id,
  name: `Field ${id}`,
  type,
  shape: shape as any,
  centerPoint: [0, 0, 0],
  sampling: type === '2D' ? { x: 1, y: 1 } : { radial: 1, angular: 1 },
  farField: false,
  fieldTypes: ['E'],
});

describe('PostprocessingTab', () => {
  it('renders structure and solution outputs with data', () => {
    const elements = [makeElement('1', 'Dipole 1', 'dipole')];
    const requestedFields: FieldDefinition[] = [makeField('f1', '2D', 'plane')];
    const fieldResults = { f1: { computed: true, num_points: 25 } };

    render(
      <PostprocessingTab
        solverState="postprocessing-ready"
        elements={elements}
        requestedFields={requestedFields}
        directivityRequested
        fieldResults={fieldResults}
      />
    );

    // Check section headers
    expect(screen.getByText('Structure')).toBeInTheDocument();
    expect(screen.getByText('Solution Outputs')).toBeInTheDocument();
    
    // Check structure content
    expect(screen.getByText('Dipole 1')).toBeInTheDocument();
    expect(screen.getByText('dipole')).toBeInTheDocument();
    
    // Check solution outputs
    expect(screen.getByText('Currents')).toBeInTheDocument();
    expect(screen.getByText('Branch currents')).toBeInTheDocument();
    expect(screen.getByText('Voltages')).toBeInTheDocument();
    expect(screen.getByText('Node potentials')).toBeInTheDocument();
    expect(screen.getByText('Directivity')).toBeInTheDocument();
    expect(screen.getByText('Field f1')).toBeInTheDocument();
    expect(screen.getByText(/2D plane · 25 pts/)).toBeInTheDocument();
  });

  it('renders empty states when no antennas or fields', () => {
    render(
      <PostprocessingTab
        solverState="solved"
        elements={[]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={null}
      />
    );

    expect(screen.getByText('No antenna loaded')).toBeInTheDocument();
    expect(screen.getByText('No fields requested')).toBeInTheDocument();
  });

  it('shows pending status for uncomputed fields', () => {
    const requestedFields: FieldDefinition[] = [makeField('f1', '3D', 'sphere')];
    const fieldResults = { f1: { computed: false, num_points: 0 } };

    render(
      <PostprocessingTab
        solverState="postprocessing-ready"
        elements={[makeElement('1', 'Loop 1', 'loop')]}
        requestedFields={requestedFields}
        directivityRequested={false}
        fieldResults={fieldResults}
      />
    );

    // Field should show without point count when not computed
    expect(screen.getByText('Field f1')).toBeInTheDocument();
    expect(screen.getByText('3D sphere')).toBeInTheDocument();
  });
});
