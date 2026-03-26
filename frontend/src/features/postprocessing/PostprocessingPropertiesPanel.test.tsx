import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import PostprocessingPropertiesPanel from './PostprocessingPropertiesPanel';
import postprocessingReducer from '../../store/postprocessingSlice';
import solverReducer from '../../store/solverSlice';

// Helper to create a mock store with postprocessing state
const createMockStore = (postprocessingState: any = {}, solverState: any = {}) => {
  return configureStore({
    reducer: {
      postprocessing: postprocessingReducer,
      solver: solverReducer,
    },
    preloadedState: {
      postprocessing: {
        viewConfigurations: [],
        selectedViewId: null,
        selectedItemId: null,
        addViewDialogOpen: false,
        addAntennaDialogOpen: false,
        addFieldDialogOpen: false,
        addScalarPlotDialogOpen: false,
        exportPDFDialogOpen: false,
        exportType: null,
        ...postprocessingState,
      },
      solver: {
        currentFrequency: null,
        frequencySweep: null,
        solverState: 'idle',
        solveProgress: 0,
        requestedFields: [],
        directivityRequested: false,
        directivitySettings: {
          thetaResolution: 181,
          phiResolution: 360,
          minFrequencyIndex: null,
          maxFrequencyIndex: null,
        },
        fieldResults: null,
        results: null,
        fieldData: null,
        error: null,
        ...solverState,
      },
    },
  });
};

describe('PostprocessingPropertiesPanel', () => {
  describe('Empty State', () => {
    it('should render empty state when no view is selected', () => {
      const store = createMockStore();

      render(
        <Provider store={store}>
          <PostprocessingPropertiesPanel />
        </Provider>
      );

      expect(screen.getByText('No view selected')).toBeInTheDocument();
      expect(screen.getByText('Create a view to get started')).toBeInTheDocument();
    });
  });

  describe('View Properties', () => {
    it('should render view name editor and type chip for 3D view', () => {
      const store = createMockStore({
        viewConfigurations: [
          {
            id: 'view-1',
            name: 'Test 3D View',
            viewType: '3D',
            selectedFrequencyHz: null,
            items: [],
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-02T10:00:00Z',
          },
        ],
        selectedViewId: 'view-1',
      });

      render(
        <Provider store={store}>
          <PostprocessingPropertiesPanel />
        </Provider>
      );

      // View name input
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput.value).toBe('Test 3D View');

      // View type chip
      expect(screen.getByText('3D View')).toBeInTheDocument();
    });

    it('should render Line view type chip correctly', () => {
      const store = createMockStore({
        viewConfigurations: [
          {
            id: 'view-1',
            name: 'Test Line View',
            viewType: 'Line',
            selectedFrequencyHz: null,
            items: [],
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-02T10:00:00Z',
          },
        ],
        selectedViewId: 'view-1',
      });

      render(
        <Provider store={store}>
          <PostprocessingPropertiesPanel />
        </Provider>
      );

      expect(screen.getByText('Line View')).toBeInTheDocument();
    });

    it('should dispatch renameViewConfiguration when name is changed', async () => {
      const store = createMockStore({
        viewConfigurations: [
          {
            id: 'view-1',
            name: 'Old Name',
            viewType: '3D',
            selectedFrequencyHz: null,
            items: [],
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-02T10:00:00Z',
          },
        ],
        selectedViewId: 'view-1',
      });

      const dispatchSpy = vi.spyOn(store, 'dispatch');

      render(
        <Provider store={store}>
          <PostprocessingPropertiesPanel />
        </Provider>
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'New Name' } });
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'postprocessing/renameViewConfiguration',
            payload: { viewId: 'view-1', name: 'New Name' },
          })
        );
      });
    });

    it('should show delete confirmation dialog and dispatch delete action', async () => {
      const store = createMockStore({
        viewConfigurations: [
          {
            id: 'view-1',
            name: 'Test View',
            viewType: '3D',
            selectedFrequencyHz: null,
            items: [],
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-02T10:00:00Z',
          },
        ],
        selectedViewId: 'view-1',
      });

      const dispatchSpy = vi.spyOn(store, 'dispatch');

      render(
        <Provider store={store}>
          <PostprocessingPropertiesPanel />
        </Provider>
      );

      // Click delete button
      const deleteButton = screen.getByRole('button', { name: /delete view/i });
      fireEvent.click(deleteButton);

      // Confirmation dialog appears
      await waitFor(() => {
        expect(screen.getByText('Delete View?')).toBeInTheDocument();
      });

      // Click confirm
      const confirmButton = screen.getByRole('button', { name: /delete/i, hidden: false });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'postprocessing/deleteViewConfiguration',
            payload: 'view-1',
          })
        );
      });
    });
  });

  // NOTE: Per-view frequency slider tests removed — frequency selection is now
  // handled by the global FrequencySelector component in PostprocessingTab.
  // See FrequencySelector.test.tsx for frequency selection tests.

  describe('Item Properties', () => {
    it('should render item properties when item is selected', () => {
      const store = createMockStore({
        viewConfigurations: [
          {
            id: 'view-1',
            name: 'Test View',
            viewType: '3D',
            selectedFrequencyHz: null,
            items: [
              {
                id: 'item-1',
                type: 'antenna-system',
                label: 'Antenna System',
                visible: true,
                opacity: 0.8,
                color: '#FF8C00',
                referenceId: 'antenna-1',
              },
            ],
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-02T10:00:00Z',
          },
        ],
        selectedViewId: 'view-1',
        selectedItemId: 'item-1',
      });

      render(
        <Provider store={store}>
          <PostprocessingPropertiesPanel />
        </Provider>
      );

      expect(screen.getByText('Item Properties')).toBeInTheDocument();

      // Label input
      const labelInput = screen.getByLabelText('Label') as HTMLInputElement;
      expect(labelInput.value).toBe('Antenna System');

      // Visibility checkbox
      const visibilityCheckbox = screen.getByRole('checkbox', { name: /visible/i });
      expect(visibilityCheckbox).toBeChecked();
    });

    it('should dispatch updateItemProperty when label is changed', async () => {
      const store = createMockStore({
        viewConfigurations: [
          {
            id: 'view-1',
            name: 'Test View',
            viewType: '3D',
            selectedFrequencyHz: null,
            items: [
              {
                id: 'item-1',
                type: 'antenna-system',
                label: 'Old Label',
                visible: true,
                opacity: 0.8,
                color: '#FF8C00',
                referenceId: 'antenna-1',
              },
            ],
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-02T10:00:00Z',
          },
        ],
        selectedViewId: 'view-1',
        selectedItemId: 'item-1',
      });

      const dispatchSpy = vi.spyOn(store, 'dispatch');

      render(
        <Provider store={store}>
          <PostprocessingPropertiesPanel />
        </Provider>
      );

      const labelInput = screen.getByLabelText('Label') as HTMLInputElement;
      fireEvent.change(labelInput, { target: { value: 'New Label' } });
      fireEvent.blur(labelInput);

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'postprocessing/updateItemProperty',
            payload: {
              viewId: 'view-1',
              itemId: 'item-1',
              property: 'label',
              value: 'New Label',
            },
          })
        );
      });
    });

    it('should dispatch toggleItemVisibility when checkbox is clicked', async () => {
      const store = createMockStore({
        viewConfigurations: [
          {
            id: 'view-1',
            name: 'Test View',
            viewType: '3D',
            selectedFrequencyHz: null,
            items: [
              {
                id: 'item-1',
                type: 'antenna-system',
                label: 'Antenna System',
                visible: true,
                opacity: 0.8,
                color: '#FF8C00',
                referenceId: 'antenna-1',
              },
            ],
            createdAt: '2026-01-02T10:00:00Z',
            updatedAt: '2026-01-02T10:00:00Z',
          },
        ],
        selectedViewId: 'view-1',
        selectedItemId: 'item-1',
      });

      const dispatchSpy = vi.spyOn(store, 'dispatch');

      render(
        <Provider store={store}>
          <PostprocessingPropertiesPanel />
        </Provider>
      );

      const visibilityCheckbox = screen.getByRole('checkbox', { name: /visible/i });
      fireEvent.click(visibilityCheckbox);

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'postprocessing/toggleItemVisibility',
            payload: { viewId: 'view-1', itemId: 'item-1' },
          })
        );
      });
    });
  });
});
