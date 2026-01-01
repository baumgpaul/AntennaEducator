import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TreeViewPanel from '../TreeViewPanel';
import type { FieldDefinition } from '@/types/fieldDefinitions';

type MinimalField = FieldDefinition;

const sampleField: MinimalField = {
  id: 'field-1',
  name: 'Field 1',
  type: '2D',
  shape: 'plane',
  centerPoint: [0, 0, 50],
  dimensions: { width: 100, height: 100 },
  normalPreset: 'XY',
  sampling: { x: 20, y: 20 },
  farField: false,
  fieldTypes: ['E'],
  visible: true,
};

describe('TreeViewPanel - solver requested quantities', () => {
  it('renders locked currents, directivity, and field items', () => {
    render(
      <TreeViewPanel
        mode="solver"
        elements={[]}
        fieldRegions={[sampleField]}
        directivityRequested
      />
    );

    expect(screen.getByText('Currents & Voltages')).toBeInTheDocument();
    expect(screen.getByText('Directivity')).toBeInTheDocument();
    expect(screen.getByText('Field 1')).toBeInTheDocument();
  });

  it('invokes directivity delete callback', () => {
    const onDirectivityDelete = vi.fn()
    render(
      <TreeViewPanel
        mode="solver"
        elements={[]}
        fieldRegions={[sampleField]}
        directivityRequested
        onDirectivityDelete={onDirectivityDelete}
      />
    );

    fireEvent.click(screen.getByLabelText('Delete directivity'));
    expect(onDirectivityDelete).toHaveBeenCalled();
  });

  it('invokes onFieldSelect when a field is clicked', () => {
    const onFieldSelect = vi.fn()
    render(
      <TreeViewPanel
        mode="solver"
        elements={[]}
        fieldRegions={[sampleField]}
        onFieldSelect={onFieldSelect}
      />
    );

    fireEvent.click(screen.getByText('Field 1'));
    expect(onFieldSelect).toHaveBeenCalledWith('field-1');
  });

  it('shows empty state when no requested quantities are present', () => {
    render(<TreeViewPanel mode="solver" elements={[]} />);

    expect(screen.getByText('No additional fields requested yet')).toBeInTheDocument();
  });
});
