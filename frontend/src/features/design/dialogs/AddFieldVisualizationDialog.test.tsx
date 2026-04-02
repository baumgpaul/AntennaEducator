import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AddFieldVisualizationDialog from './AddFieldVisualizationDialog';
import postprocessingReducer from '@/store/postprocessingSlice';
import solverReducer from '@/store/solverSlice';

describe('AddFieldVisualizationDialog', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
        solver: solverReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [
            {
              id: 'view-1',
              name: 'Test View',
              viewType: '3D',
              items: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          selectedViewId: 'view-1',
          selectedItemId: null,
          addViewDialogOpen: false,
          addAntennaDialogOpen: false,
          addFieldDialogOpen: true,
          addScalarPlotDialogOpen: false,
        },
        solver: {
          requestedFields: [
            {
              id: 'field-1',
              name: 'E-field Plane',
              type: '2D',
              shape: 'plane',
              centerPoint: [0, 0, 50],
              dimensions: { width: 100, height: 100 },
              sampling: { x: 20, y: 20 },
              fieldType: 'E',
              opacity: 0.3,
            },
          ],
          solverState: 'postprocessing-ready',
          directivityRequested: false,
          fieldResults: { 'field-1': { computed: true, num_points: 400 } },
        },
      },
    });
  });

  const renderDialog = () => {
    return render(
      <Provider store={store}>
        <AddFieldVisualizationDialog />
      </Provider>
    );
  };

  it('renders dialog with stepper', () => {
    renderDialog();
    expect(screen.getByText('Add Field Visualization')).toBeInTheDocument();
    expect(screen.getAllByText('Select Field').length).toBeGreaterThan(0);
  });

  it('displays field list in step 1', () => {
    renderDialog();

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    expect(screen.getByText(/E-field Plane/)).toBeInTheDocument();
  });

  it('navigates to step 2 after field selection', async () => {
    renderDialog();

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    const option = screen.getByText(/E-field Plane/);
    fireEvent.click(option);

    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getAllByText('Visualization Mode').length).toBeGreaterThan(0);
    });
  });

  it('navigates back from step 2 to step 1', async () => {
    renderDialog();

    // Go to step 2
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    const option = screen.getByText(/E-field Plane/);
    fireEvent.click(option);
    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getAllByText('Visualization Mode').length).toBeGreaterThan(0);
    });

    // Go back
    const backButton = screen.getByRole('button', { name: /back/i });
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getAllByText('Select Field').length).toBeGreaterThan(0);
    });
  });

  it('adds field magnitude visualization', async () => {
    renderDialog();

    // Step 1: Select field
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    const option = screen.getByText(/E-field Plane/);
    fireEvent.click(option);
    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getAllByText('Visualization Mode').length).toBeGreaterThan(0);
    });

    // Step 2: Select magnitude mode
    const magnitudeRadio = screen.getByLabelText(/Magnitude/i);
    fireEvent.click(magnitudeRadio);

    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      const state = store.getState();
      const view = state.postprocessing.viewConfigurations[0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].type).toBe('field-magnitude');
      expect(view.items[0].fieldId).toBe('field-1');
    });
  });

  it('shows alert when no fields computed', () => {
    // Create store with no fields
    const emptyStore = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
        solver: solverReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [{ id: 'view-1', name: 'Test', viewType: '3D', items: [], createdAt: Date.now(), updatedAt: Date.now() }],
          selectedViewId: 'view-1',
          selectedItemId: null,
          addViewDialogOpen: false,
          addAntennaDialogOpen: false,
          addFieldDialogOpen: true,
          addScalarPlotDialogOpen: false,
        },
        solver: {
          requestedFields: [],
          solverState: 'idle',
          directivityRequested: false,
          fieldResults: null,
        },
      },
    });

    render(
      <Provider store={emptyStore}>
        <AddFieldVisualizationDialog />
      </Provider>
    );

    expect(screen.getByText(/No fields available/i)).toBeInTheDocument();
  });
});
