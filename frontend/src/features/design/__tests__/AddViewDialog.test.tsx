import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import AddViewDialog from '../dialogs/AddViewDialog';
import postprocessingReducer from '@/store/postprocessingSlice';

describe('AddViewDialog', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [],
          selectedViewId: null,
          selectedItemId: null,
          addViewDialogOpen: true,
          addAntennaElementDialogOpen: false,
          addFieldVisualizationDialogOpen: false,
          addScalarPlotDialogOpen: false,
        },
      },
    });
  });

  const renderDialog = () => {
    return render(
      <Provider store={store}>
        <AddViewDialog />
      </Provider>
    );
  };

  it('renders dialog when open', () => {
    renderDialog();
    expect(screen.getByText('Create New View')).toBeInTheDocument();
    expect(screen.getByLabelText(/View Name/i)).toBeInTheDocument();
  });

  it('creates view with custom name and 3D type', async () => {
    renderDialog();
    
    const nameInput = screen.getByLabelText(/View Name/i);
    fireEvent.change(nameInput, { target: { value: 'My Custom View' } });
    
    const radio3D = screen.getByLabelText(/3D View/);
    fireEvent.click(radio3D);
    
    const createButton = screen.getByRole('button', { name: /create/i });
    fireEvent.click(createButton);
    
    await waitFor(() => {
      const state = store.getState();
      expect(state.postprocessing.viewConfigurations).toHaveLength(1);
      expect(state.postprocessing.viewConfigurations[0].name).toBe('My Custom View');
      expect(state.postprocessing.viewConfigurations[0].viewType).toBe('3D');
    });
  });

  it('auto-generates view name when blank', async () => {
    renderDialog();
    
    // Leave name blank
    const radioLine = screen.getByLabelText('Line View');
    fireEvent.click(radioLine);
    
    const createButton = screen.getByRole('button', { name: /create/i });
    fireEvent.click(createButton);
    
    await waitFor(() => {
      const state = store.getState();
      expect(state.postprocessing.viewConfigurations).toHaveLength(1);
      expect(state.postprocessing.viewConfigurations[0].name).toBe('Result View 1');
      expect(state.postprocessing.viewConfigurations[0].viewType).toBe('Line');
    });
  });

  it('closes dialog on cancel', async () => {
    renderDialog();
    
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    
    await waitFor(() => {
      const state = store.getState();
      expect(state.postprocessing.addViewDialogOpen).toBe(false);
    });
  });
});
