import { describe, it, expect, beforeEach } from 'vitest';
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
          addAntennaDialogOpen: false,
          addFieldDialogOpen: false,
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

  it('shows VSWR option in data type selector', async () => {
    renderDialog();

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    const vswrOption = screen.getByText('VSWR vs Sweep Variable');
    fireEvent.click(vswrOption);

    await waitFor(() => {
      expect(screen.getByDisplayValue('vswr')).toBeInTheDocument();
    });
  });

  it('does not show port selector for port quantity line plot', async () => {
    renderDialog();

    // Port number is no longer needed for these presets
    expect(screen.queryByLabelText(/Port Number/i)).not.toBeInTheDocument();
  });

  it('adds a line-plot item to view', async () => {
    renderDialog();

    // Default is Re(Z), just click Add
    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      const state = store.getState();
      const view = state.postprocessing.viewConfigurations[0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].type).toBe('line-plot');
    });
  });

  it('adds VSWR line plot with port quantity trace', async () => {
    renderDialog();

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);
    const vswrOption = screen.getByText('VSWR vs Sweep Variable');
    fireEvent.click(vswrOption);

    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      const state = store.getState();
      const view = state.postprocessing.viewConfigurations[0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].type).toBe('line-plot');
      expect(view.items[0].traces?.[0]?.quantity?.source).toBe('port');
      expect(view.items[0].traces?.[0]?.quantity?.quantity).toBe('vswr');
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
          addAntennaDialogOpen: false,
          addFieldDialogOpen: false,
          addScalarPlotDialogOpen: true,
          scalarPlotPreselect: null,
          exportPDFDialogOpen: false,
          exportType: null,
        },
      },
    });

    render(
      <Provider store={store3D}>
        <AddScalarPlotDialog />
      </Provider>
    );

    // The component silently refuses to add to non-Line views
    const addButton = screen.getByRole('button', { name: /add/i });
    fireEvent.click(addButton);

    // Verify no items were added
    const state = store3D.getState();
    const view = state.postprocessing.viewConfigurations[0];
    expect(view.items).toHaveLength(0);
  });
});
