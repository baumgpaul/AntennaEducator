import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AddAntennaElementDialog from './AddAntennaElementDialog';
import postprocessingReducer from '@/store/postprocessingSlice';
import designReducer from '@/store/designSlice';

describe('AddAntennaElementDialog', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
        design: designReducer,
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
          addAntennaElementDialogOpen: true,
          addFieldVisualizationDialogOpen: false,
          addScalarPlotDialogOpen: false,
        },
        design: {
          elements: [
            { id: 'ant-1', name: 'Dipole 1', type: 'dipole' },
            { id: 'ant-2', name: 'Loop', type: 'circular_loop' },
          ],
          selectedElementId: null,
          connections: [],
          sources: [],
          lumpedElements: [],
        },
      },
    });
  });

  const renderDialog = () => {
    return render(
      <Provider store={store}>
        <AddAntennaElementDialog />
      </Provider>
    );
  };

  it('renders dialog when open', () => {
    renderDialog();
    expect(screen.getByText(/Add Antenna Element/)).toBeInTheDocument();
  });

  it('displays antenna list in dropdown', () => {
    renderDialog();

    const select = screen.getByLabelText(/Select Antenna/i);
    fireEvent.mouseDown(select);

    expect(screen.getByText('Dipole 1')).toBeInTheDocument();
    expect(screen.getByText('Loop')).toBeInTheDocument();
  });

  it('adds selected antenna to view', async () => {
    renderDialog();

    const select = screen.getByLabelText(/Select Antenna/i);
    fireEvent.mouseDown(select);

    const option = screen.getByText('Dipole 1');
    fireEvent.click(option);

    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      const state = store.getState();
      const view = state.postprocessing.viewConfigurations[0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].type).toBe('antenna-element');
      expect(view.items[0].antennaId).toBe('ant-1');
    });
  });

  it('shows alert when no antennas exist', () => {
    // Create store with no antennas
    const emptyStore = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
        design: designReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [{ id: 'view-1', name: 'Test', viewType: '3D', items: [], createdAt: Date.now(), updatedAt: Date.now() }],
          selectedViewId: 'view-1',
          selectedItemId: null,
          addViewDialogOpen: false,
          addAntennaElementDialogOpen: true,
          addFieldVisualizationDialogOpen: false,
          addScalarPlotDialogOpen: false,
        },
        design: {
          elements: [],
          selectedElementId: null,
          connections: [],
          sources: [],
          lumpedElements: [],
        },
      },
    });

    render(
      <Provider store={emptyStore}>
        <AddAntennaElementDialog />
      </Provider>
    );

    expect(screen.getByText(/No antennas in design/i)).toBeInTheDocument();
  });
});
