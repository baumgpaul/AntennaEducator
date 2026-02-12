/**
 * Redux slice for Postprocessing Tab Multi-View Configuration System
 *
 * Manages view configurations, items, and UI state for the postprocessing workflow.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import type { RootState } from './store';
import type {
  PostprocessingState,
  ViewConfiguration,
  ViewItem,
  ViewType,
  ViewItemType,
} from '../types/postprocessing';
import {
  DEFAULT_VIEW_CONFIG,
  MAX_VIEW_CONFIGURATIONS,
  generateDefaultViewName,
  generateDefaultItemLabel,
} from '../types/postprocessing';

/**
 * Initial state for postprocessing
 */
const initialState: PostprocessingState = {
  viewConfigurations: [],
  selectedViewId: null,
  selectedItemId: null,
  addViewDialogOpen: false,
  addAntennaDialogOpen: false,
  addFieldDialogOpen: false,
  addScalarPlotDialogOpen: false,
  scalarPlotPreselect: null,
  exportPDFDialogOpen: false,
  exportType: null,
};

const postprocessingSlice = createSlice({
  name: 'postprocessing',
  initialState,
  reducers: {
    /**
     * Create a new view configuration
     */
    createViewConfiguration: (
      state,
      action: PayloadAction<{ name?: string; viewType: ViewType }>
    ) => {
      if (state.viewConfigurations.length >= MAX_VIEW_CONFIGURATIONS) {
        console.warn(`Maximum of ${MAX_VIEW_CONFIGURATIONS} views reached`);
        return;
      }

      const now = new Date().toISOString();
      const name = action.payload.name || generateDefaultViewName(state.viewConfigurations);

      const newView: ViewConfiguration = {
        ...DEFAULT_VIEW_CONFIG,
        id: uuidv4(),
        name,
        viewType: action.payload.viewType,
        createdAt: now,
        updatedAt: now,
      };

      state.viewConfigurations.push(newView);
      state.selectedViewId = newView.id;
      state.selectedItemId = null;
    },

    /**
     * Delete a view configuration
     */
    deleteViewConfiguration: (state, action: PayloadAction<string>) => {
      const viewId = action.payload;
      const index = state.viewConfigurations.findIndex(v => v.id === viewId);

      if (index === -1) return;

      state.viewConfigurations.splice(index, 1);

      // If deleted view was selected, select another view or null
      if (state.selectedViewId === viewId) {
        if (state.viewConfigurations.length > 0) {
          // Select previous view, or first if we deleted the first view
          const newIndex = Math.max(0, index - 1);
          state.selectedViewId = state.viewConfigurations[newIndex]?.id || null;
        } else {
          state.selectedViewId = null;
        }
        state.selectedItemId = null;
      }
    },

    /**
     * Rename a view configuration
     */
    renameViewConfiguration: (
      state,
      action: PayloadAction<{ viewId: string; name: string }>
    ) => {
      const view = state.viewConfigurations.find(v => v.id === action.payload.viewId);
      if (view) {
        view.name = action.payload.name;
        view.updatedAt = new Date().toISOString();
      }
    },

    /**
     * Select a view configuration
     */
    selectView: (state, action: PayloadAction<string | null>) => {
      state.selectedViewId = action.payload;
      state.selectedItemId = null;
    },

    /**
     * Add an item to a view
     */
    addItemToView: (
      state,
      action: PayloadAction<{ viewId: string; item: Omit<ViewItem, 'id'> }>
    ) => {
      const view = state.viewConfigurations.find(v => v.id === action.payload.viewId);
      if (!view) return;

      const newItem: ViewItem = {
        ...action.payload.item,
        id: uuidv4(),
        label: action.payload.item.label || generateDefaultItemLabel(
          action.payload.item.type,
          view.items
        ),
      };

      view.items.push(newItem);
      view.updatedAt = new Date().toISOString();
      state.selectedItemId = newItem.id;
    },

    /**
     * Remove an item from a view
     */
    removeItemFromView: (
      state,
      action: PayloadAction<{ viewId: string; itemId: string }>
    ) => {
      const view = state.viewConfigurations.find(v => v.id === action.payload.viewId);
      if (!view) return;

      const index = view.items.findIndex(item => item.id === action.payload.itemId);
      if (index === -1) return;

      view.items.splice(index, 1);
      view.updatedAt = new Date().toISOString();

      // Clear selection if deleted item was selected
      if (state.selectedItemId === action.payload.itemId) {
        state.selectedItemId = null;
      }
    },

    /**
     * Update a property of a view item
     */
    updateItemProperty: (
      state,
      action: PayloadAction<{
        viewId: string;
        itemId: string;
        property: keyof ViewItem;
        value: any;
      }>
    ) => {
      const view = state.viewConfigurations.find(v => v.id === action.payload.viewId);
      if (!view) return;

      const item = view.items.find(i => i.id === action.payload.itemId);
      if (!item) return;

      (item as any)[action.payload.property] = action.payload.value;
      view.updatedAt = new Date().toISOString();
    },

    /**
     * Toggle visibility of a view item
     */
    toggleItemVisibility: (
      state,
      action: PayloadAction<{ viewId: string; itemId: string }>
    ) => {
      const view = state.viewConfigurations.find(v => v.id === action.payload.viewId);
      if (!view) return;

      const item = view.items.find(i => i.id === action.payload.itemId);
      if (!item) return;

      item.visible = !item.visible;
      view.updatedAt = new Date().toISOString();
    },

    /**
     * Set the selected frequency for a 3D view
     */
    setViewFrequency: (
      state,
      action: PayloadAction<{ viewId: string; frequencyHz: number }>
    ) => {
      const view = state.viewConfigurations.find(v => v.id === action.payload.viewId);
      if (!view || view.viewType !== '3D') return;

      view.selectedFrequencyHz = action.payload.frequencyHz;
      view.updatedAt = new Date().toISOString();
    },

    /**
     * Select an item within a view (for properties panel)
     */
    selectItem: (state, action: PayloadAction<string | null>) => {
      state.selectedItemId = action.payload;
    },

    /**
     * Load view configurations from database
     */
    loadViewConfigurations: (state, action: PayloadAction<ViewConfiguration[]>) => {
      state.viewConfigurations = action.payload;
      // Select first view if none selected
      if (!state.selectedViewId && state.viewConfigurations.length > 0) {
        state.selectedViewId = state.viewConfigurations[0].id;
      }
    },

    /**
     * Clear all view configurations (on project switch)
     */
    clearViewConfigurations: (state) => {
      state.viewConfigurations = [];
      state.selectedViewId = null;
      state.selectedItemId = null;
    },

    // Dialog state management
    setAddViewDialogOpen: (state, action: PayloadAction<boolean>) => {
      state.addViewDialogOpen = action.payload;
    },

    setAddAntennaDialogOpen: (state, action: PayloadAction<boolean>) => {
      state.addAntennaDialogOpen = action.payload;
    },

    setAddFieldDialogOpen: (state, action: PayloadAction<boolean>) => {
      state.addFieldDialogOpen = action.payload;
    },

    setAddScalarPlotDialogOpen: (state, action: PayloadAction<boolean>) => {
      state.addScalarPlotDialogOpen = action.payload;
      if (!action.payload) {
        state.scalarPlotPreselect = null;
      }
    },

    setScalarPlotPreselect: (state, action: PayloadAction<'impedance' | 'voltage' | 'current' | null>) => {
      state.scalarPlotPreselect = action.payload;
    },

    setExportPDFDialogOpen: (state, action: PayloadAction<boolean>) => {
      state.exportPDFDialogOpen = action.payload;
    },

    setExportType: (state, action: PayloadAction<'pdf' | 'paraview' | null>) => {
      state.exportType = action.payload;
    },
  },
});

// Export actions
export const {
  createViewConfiguration,
  deleteViewConfiguration,
  renameViewConfiguration,
  selectView,
  addItemToView,
  removeItemFromView,
  updateItemProperty,
  toggleItemVisibility,
  setViewFrequency,
  selectItem,
  loadViewConfigurations,
  clearViewConfigurations,
  setAddViewDialogOpen,
  setAddAntennaDialogOpen,
  setAddFieldDialogOpen,
  setAddScalarPlotDialogOpen,
  setScalarPlotPreselect,
  setExportPDFDialogOpen,
  setExportType,
} = postprocessingSlice.actions;

// Selectors
export const selectViewConfigurations = (state: RootState) =>
  state.postprocessing.viewConfigurations;

export const selectSelectedViewId = (state: RootState) =>
  state.postprocessing.selectedViewId;

export const selectSelectedView = (state: RootState) => {
  const viewId = state.postprocessing.selectedViewId;
  if (!viewId) return null;
  return state.postprocessing.viewConfigurations.find(v => v.id === viewId) || null;
};

export const selectSelectedViewItems = (state: RootState) => {
  const view = selectSelectedView(state);
  return view?.items || [];
};

export const selectViewById = (viewId: string) => (state: RootState) =>
  state.postprocessing.viewConfigurations.find(v => v.id === viewId);

export const selectItemById = (viewId: string, itemId: string) => (state: RootState) => {
  const view = state.postprocessing.viewConfigurations.find(v => v.id === viewId);
  if (!view) return null;
  return view.items.find(item => item.id === itemId) || null;
};

export const selectSelectedItemId = (state: RootState) =>
  state.postprocessing.selectedItemId;

export const selectSelectedItem = (state: RootState) => {
  const viewId = state.postprocessing.selectedViewId;
  const itemId = state.postprocessing.selectedItemId;
  if (!viewId || !itemId) return null;
  return selectItemById(viewId, itemId)(state);
};

export const selectAddViewDialogOpen = (state: RootState) =>
  state.postprocessing.addViewDialogOpen;

export const selectAddAntennaDialogOpen = (state: RootState) =>
  state.postprocessing.addAntennaDialogOpen;

export const selectAddFieldDialogOpen = (state: RootState) =>
  state.postprocessing.addFieldDialogOpen;

export const selectAddScalarPlotDialogOpen = (state: RootState) =>
  state.postprocessing.addScalarPlotDialogOpen;

export const selectExportPDFDialogOpen = (state: RootState) =>
  state.postprocessing.exportPDFDialogOpen;

export const selectExportType = (state: RootState) =>
  state.postprocessing.exportType;

export default postprocessingSlice.reducer;
