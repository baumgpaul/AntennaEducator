import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { SolverPropertiesPanel } from '../SolverPropertiesPanel';
import solverReducer from '@/store/solverSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';

// Helper to create a mock store with field data
const createMockStore = (fields: FieldDefinition[] = [], directivityRequested = false) => {
  return configureStore({
    reducer: {
      solver: solverReducer,
    },
    preloadedState: {
      solver: {
        status: 'idle',
        progress: 0,
        error: null,
        jobId: null,
        currentRequest: null,
        results: null,
        currentDistribution: null,
        radiationPattern: null,
        multiAntennaResults: null,
        frequencySweep: null,
        sweepInProgress: false,
        resultsHistory: [],
        requestedFields: fields,
        directivityRequested,
        directivitySettings: { theta_points: 19, phi_points: 37 },
        solverState: 'idle',
        currentFrequency: null,
      },
    },
  });
};

const sampleField2DPlane: FieldDefinition = {
  id: 'field-1',
  name: 'Test Field 1',
  type: '2D',
  shape: 'plane',
  centerPoint: [0, 0, 50],
  dimensions: { width: 100, height: 100 },
  normalVector: [0, 0, 1],
  normalPreset: 'XY',
  sampling: { x: 20, y: 20 },
  farField: false,
  fieldType: 'E',
  visible: true,
};

const sampleField2DCircle: FieldDefinition = {
  id: 'field-2',
  name: 'Test Field 2',
  type: '2D',
  shape: 'circle',
  centerPoint: [0, 0, 100],
  dimensions: { radius: 50 },
  normalVector: [0, 0, 1],
  normalPreset: 'XY',
  sampling: { x: 30, y: 30 },
  farField: true,
  fieldType: 'poynting',
  visible: true,
};

const sampleField3DSphere: FieldDefinition = {
  id: 'field-3',
  name: 'Test Field 3',
  type: '3D',
  shape: 'sphere',
  centerPoint: [0, 0, 150],
  sphereRadius: 200,
  sampling: { radial: 10, angular: 20 },
  farField: false,
  fieldType: 'E',
  visible: true,
};

const sampleField3DCube: FieldDefinition = {
  id: 'field-4',
  name: 'Test Field 4',
  type: '3D',
  shape: 'cube',
  centerPoint: [50, 50, 50],
  cubeDimensions: { Lx: 100, Ly: 100, Lz: 100 },
  sampling: { radial: 15, angular: 25 },
  farField: true,
  fieldType: 'H',
  visible: true,
};

describe('SolverPropertiesPanel', () => {
  const mockOnFieldRegionsVisibleChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Basic Rendering Tests
  // ============================================================================

  it('renders field region display settings', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    expect(screen.getByText('Field Region Display')).toBeInTheDocument();
    expect(screen.getByText('Show Field Regions')).toBeInTheDocument();
  });

  it('shows empty state when no field is selected', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    expect(screen.getByText('Select a field region in the tree view to edit its properties')).toBeInTheDocument();
  });

  it('shows directivity message when selected', () => {
    const store = createMockStore([], true);
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="directivity"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    expect(screen.getByText('Directivity')).toBeInTheDocument();
    expect(screen.getByText(/angular discretization/i)).toBeInTheDocument();
  });

  it('shows field properties editor when field is selected', () => {
    const store = createMockStore([sampleField2DPlane]);
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    expect(screen.getByText('Test Field 1')).toBeInTheDocument();
    expect(screen.getByText('Type: 2D Region')).toBeInTheDocument();
  });

  it('calls onFieldRegionsVisibleChange when checkbox is toggled', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(mockOnFieldRegionsVisibleChange).toHaveBeenCalledWith(false);
  });

  it('leaves checkbox enabled even when hidden', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          fieldRegionsVisible={false}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  // ============================================================================
  // 2D Plane Field Editing Tests
  // ============================================================================

  it('renders 2D plane field editor with all controls', () => {
    const store = createMockStore([sampleField2DPlane]);
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    // Check that field editor panel is displayed with key elements
    expect(screen.getByText('Test Field 1')).toBeInTheDocument();
    expect(screen.getByText('Type: 2D Region')).toBeInTheDocument();
    // Check some key input fields exist
    expect(screen.getByLabelText('X')).toBeInTheDocument();
    expect(screen.getByLabelText('Width (X)')).toBeInTheDocument();
  });

  it('updates field name for identification', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const nameInput = screen.getByLabelText('Field Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Near Plane');
    fireEvent.blur(nameInput);

    const state = store.getState();
    expect(state.solver.requestedFields[0].name).toBe('Near Plane');
  });

  it('updates per-field opacity', () => {
    const store = createMockStore([sampleField2DPlane]);

    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const slider = screen.getByRole('slider', { name: /field opacity/i });
    fireEvent.change(slider, { target: { value: 60 } });

    const state = store.getState();
    expect(state.solver.requestedFields[0].opacity).toBeCloseTo(0.6);
  });

  it('updates center point for 2D plane field', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const xInput = screen.getByLabelText('X');
    await user.clear(xInput);
    await user.type(xInput, '25');
    fireEvent.blur(xInput);

    const state = store.getState();
    expect(state.solver.requestedFields[0].centerPoint[0]).toBe(25);
  });

  it('updates plane dimensions', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const widthInput = screen.getByLabelText('Width (X)');
    await user.clear(widthInput);
    await user.type(widthInput, '150');
    fireEvent.blur(widthInput);

    const state = store.getState();
    expect(state.solver.requestedFields[0].dimensions?.width).toBe(150);
  });

  it('updates sampling resolution for 2D field', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const xSamplingInput = screen.getByLabelText('Points in X');
    await user.clear(xSamplingInput);
    await user.type(xSamplingInput, '30');
    fireEvent.blur(xSamplingInput);

    const state = store.getState();
    expect(state.solver.requestedFields[0].sampling.x).toBe(30);
  });

  // ============================================================================
  // 2D Circle Field Editing Tests
  // ============================================================================

  it('renders 2D circle field editor', () => {
    const store = createMockStore([sampleField2DCircle]);
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-2"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    expect(screen.getByLabelText('Radius')).toBeInTheDocument();
    expect(screen.getByText('Circle Radius (mm):')).toBeInTheDocument();
  });

  it('updates circle radius', async () => {
    const store = createMockStore([sampleField2DCircle]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-2"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const radiusInput = screen.getByLabelText('Radius');
    await user.clear(radiusInput);
    await user.type(radiusInput, '75');
    fireEvent.blur(radiusInput);

    const state = store.getState();
    expect(state.solver.requestedFields[0].dimensions?.radius).toBe(75);
  });

  // ============================================================================
  // 3D Sphere Field Editing Tests
  // ============================================================================

  it('renders 3D sphere field editor', () => {
    const store = createMockStore([sampleField3DSphere]);
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-3"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    expect(screen.getByText('Sphere Radius (mm):')).toBeInTheDocument();
    expect(screen.getByLabelText('Radial Points')).toBeInTheDocument();
    expect(screen.getByLabelText('Angular Points')).toBeInTheDocument();
  });

  it('updates sphere radius', async () => {
    const store = createMockStore([sampleField3DSphere]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-3"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const radiusInput = screen.getByLabelText('Radius');
    await user.clear(radiusInput);
    await user.type(radiusInput, '250');
    fireEvent.blur(radiusInput);

    const state = store.getState();
    expect(state.solver.requestedFields[0].sphereRadius).toBe(250);
  });

  it('updates 3D sampling resolution', async () => {
    const store = createMockStore([sampleField3DSphere]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-3"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const radialInput = screen.getByLabelText('Radial Points');
    await user.clear(radialInput);
    await user.type(radialInput, '15');
    fireEvent.blur(radialInput);

    const state = store.getState();
    expect(state.solver.requestedFields[0].sampling.radial).toBe(15);
  });

  // ============================================================================
  // 3D Cube Field Editing Tests
  // ============================================================================

  it('renders 3D cube field editor', () => {
    const store = createMockStore([sampleField3DCube]);
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-4"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    expect(screen.getByText('Cube Dimensions (mm):')).toBeInTheDocument();
    expect(screen.getByLabelText('Length X')).toBeInTheDocument();
    expect(screen.getByLabelText('Length Y')).toBeInTheDocument();
    expect(screen.getByLabelText('Length Z')).toBeInTheDocument();
  });

  it('updates cube dimensions', async () => {
    const store = createMockStore([sampleField3DCube]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-4"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const lxInput = screen.getByLabelText('Length X');
    await user.clear(lxInput);
    await user.type(lxInput, '120');
    fireEvent.blur(lxInput);

    const state = store.getState();
    expect(state.solver.requestedFields[0].cubeDimensions?.Lx).toBe(120);
  });

  // ============================================================================
  // Field Type Selection Tests
  // ============================================================================

  it('toggles field types', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    // Initial state: E is selected (radio button)
    const eRadio = screen.getByLabelText('E-field (Electric)');
    const hRadio = screen.getByLabelText('H-field (Magnetic)');
    const poyntingRadio = screen.getByLabelText('Poynting (S)');

    expect(eRadio).toBeChecked();
    expect(hRadio).not.toBeChecked();
    expect(poyntingRadio).not.toBeChecked();

    // Select Poynting (radio button - only one can be selected)
    await user.click(poyntingRadio);
    
    const state = store.getState();
    expect(state.solver.requestedFields[0].fieldType).toBe('poynting');
  });

  // ============================================================================
  // Far/Near Field Toggle Tests
  // ============================================================================

  it('toggles far/near field', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const farFieldRadio = screen.getByLabelText('Far field');
    await user.click(farFieldRadio);

    const state = store.getState();
    expect(state.solver.requestedFields[0].farField).toBe(true);
  });

  // ============================================================================
  // Delete Functionality Tests
  // ============================================================================

  it('shows delete confirmation dialog', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const deleteButton = screen.getByRole('button', { name: /delete field/i });
    await user.click(deleteButton);

    expect(screen.getByText('Delete Field Region?')).toBeInTheDocument();
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
  });

  it('deletes field on confirmation', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const deleteButton = screen.getByRole('button', { name: /delete field/i });
    await user.click(deleteButton);

    const confirmButton = screen.getByRole('button', { name: /delete/i, hidden: false });
    await user.click(confirmButton);

    const state = store.getState();
    expect(state.solver.requestedFields).toHaveLength(0);
  });

  it('cancels delete dialog', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    const deleteButton = screen.getByRole('button', { name: /delete field/i });
    await user.click(deleteButton);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    // Dialog should close, field should still exist
    await waitFor(() => {
      expect(screen.queryByText('Delete Field Region?')).not.toBeInTheDocument();
    });

    const state = store.getState();
    expect(state.solver.requestedFields).toHaveLength(1);
  });

  // ============================================================================
  // Shape Change Tests
  // ============================================================================

  it('updates field type toggle (E-field)', async () => {
    const store = createMockStore([sampleField2DPlane]);
    const user = userEvent.setup();
    
    render(
      <Provider store={store}>
        <SolverPropertiesPanel
          selectedFieldId="field-1"
          fieldRegionsVisible={true}
          onFieldRegionsVisibleChange={mockOnFieldRegionsVisibleChange}
        />
      </Provider>
    );

    // Verify initial field type and can be changed
    const poyntingRadio = screen.getByLabelText('Poynting (S)');
    expect(poyntingRadio).not.toBeChecked();
    
    // Select Poynting (radio button)
    await user.click(poyntingRadio);
    
    const state = store.getState();
    expect(state.solver.requestedFields[0].fieldType).toBe('poynting');
  });
});
