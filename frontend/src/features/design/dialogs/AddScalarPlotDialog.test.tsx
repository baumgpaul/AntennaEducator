import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AddScalarPlotDialog from './AddScalarPlotDialog';
import postprocessingReducer from '@/store/postprocessingSlice';

describe('AddScalarPlotDialog', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [
            {
              id: 'view-1',
              name: 'Line View',
              viewType: 'Line',
              items: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          selectedViewId: 'view-1',
          selectedItemId: null,
          addViewDialogOpen: false,
          addAntennaElementDialogOpen: false,
          addFieldVisualizationDialogOpen: false,
          addScalarPlotDialogOpen: true,
        },
      },
    });
  });

  const renderDialog = () => {
    return render(
      <Provider store={store}>
        <AddScalarPlotDialog />
      </Provider>
    );
  };

  it('renders dialog when open', () => {
    renderDialog();
    expect(screen.getByText('Add Scalar Plot')).toBeInTheDocument();
  });

  it('shows port selector for voltage plot', async () => {
    renderDialog();

    const select = screen.getByLabelText(/Data Type/i);
    fireEvent.mouseDown(select);

    const voltageOption = screen.getByText('Voltage vs Frequency');
    fireEvent.click(voltageOption);

    await waitFor(() => {
      expect(screen.getByLabelText(/Port Number/i)).toBeInTheDocument();
    });
  });

  it('hides port selector for impedance plot', async () => {
    renderDialog();

    const select = screen.getByLabelText(/Data Type/i);
    fireEvent.mouseDown(select);

    const impedanceOption = screen.getByText('Input Impedance');
    fireEvent.click(impedanceOption);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Port Number/i)).not.toBeInTheDocument();
    });
  });

  it('adds impedance plot to view', async () => {
    renderDialog();

    const select = screen.getByLabelText(/Plot Type/i);
    fireEvent.mouseDown(select);
    const impedanceOption = screen.getByText('Input Impedance');
    fireEvent.click(impedanceOption);

    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      const state = store.getState();
      const view = state.postprocessing.viewConfigurations[0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].type).toBe('scalar-impedance');
    });
  });

  it('adds voltage plot with port number', async () => {
    renderDialog();

    const select = screen.getByLabelText(/Plot Type/i);
    fireEvent.mouseDown(select);
    const voltageOption = screen.getByText('Voltage vs Frequency');
    fireEvent.click(voltageOption);

    await waitFor(() => {
      const portInput = screen.getByLabelText(/Port Number/i);
      fireEvent.change(portInput, { target: { value: '2' } });
    });

    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      const state = store.getState();
      const view = state.postprocessing.viewConfigurations[0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].type).toBe('scalar-voltage');
      expect(view.items[0].portNumber).toBe(2);
    });
  });

  it('disables add button when Line view not selected', () => {
    // Create store with 3D view
    const store3D = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [
            {
              id: 'view-1',
              name: '3D View',
              viewType: '3D',
              items: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          selectedViewId: 'view-1',
          selectedItemId: null,
          addViewDialogOpen: false,
          addAntennaElementDialogOpen: false,
          addFieldVisualizationDialogOpen: false,
          addScalarPlotDialogOpen: true,
        },
      },
    });

    render(
      <Provider store={store3D}>
        <AddScalarPlotDialog />
      </Provider>
    );

    expect(screen.getByText(/Scalar plots are only available for Line views/i)).toBeInTheDocument();
  });
});
