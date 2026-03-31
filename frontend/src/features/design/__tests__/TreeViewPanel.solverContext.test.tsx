import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import TreeViewPanel from '../TreeViewPanel';
import type { FieldDefinition } from '@/types/fieldDefinitions';

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

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
  fieldType: 'E',
  visible: true,
};

describe('TreeViewPanel - solver requested quantities', () => {
  it('renders locked currents, directivity, and field items', () => {
    render(
      <Provider store={createTestStore()}>
        <TreeViewPanel
          mode="solver"
          elements={[]}
          fieldRegions={[sampleField]}
          directivityRequested
        />
      </Provider>
    );

    expect(screen.getByText('Currents & Voltages')).toBeInTheDocument();
    expect(screen.getByText('Directivity')).toBeInTheDocument();
    expect(screen.getByText('Field 1')).toBeInTheDocument();
  });

  it('invokes directivity delete callback', () => {
    const onDirectivityDelete = vi.fn()
    render(
      <Provider store={createTestStore()}>
        <TreeViewPanel
          mode="solver"
          elements={[]}
          fieldRegions={[sampleField]}
          directivityRequested
          onDirectivityDelete={onDirectivityDelete}
        />
      </Provider>
    );

    fireEvent.click(screen.getByLabelText('Delete directivity'));
    expect(onDirectivityDelete).toHaveBeenCalled();
  });

  it('invokes onFieldSelect when a field is clicked', () => {
    const onFieldSelect = vi.fn()
    render(
      <Provider store={createTestStore()}>
        <TreeViewPanel
          mode="solver"
          elements={[]}
          fieldRegions={[sampleField]}
          onFieldSelect={onFieldSelect}
        />
      </Provider>
    );

    fireEvent.click(screen.getByText('Field 1'));
    expect(onFieldSelect).toHaveBeenCalledWith('field-1');
  });

  it('shows empty state when no requested quantities are present', () => {
    render(
      <Provider store={createTestStore()}>
        <TreeViewPanel mode="solver" elements={[]} />
      </Provider>
    );

    expect(screen.getByText('No additional fields requested yet')).toBeInTheDocument();
  });
});
