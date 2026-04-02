/**
 * Test suite for postprocessingSlice
 *
 * Tests all actions, reducers, and selectors for the multi-view configuration system.
 * Target: 18+ tests with 90%+ coverage
 */

import { configureStore } from '@reduxjs/toolkit';
import postprocessingReducer, {
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
  selectViewConfigurations,
  selectSelectedView,
  selectSelectedViewItems,
  selectSelectedItem,
} from './postprocessingSlice';
import type { PostprocessingState, ViewConfiguration, ViewItem } from '../types/postprocessing';
import { MAX_VIEW_CONFIGURATIONS } from '../types/postprocessing';

// Helper to create a test store
function createTestStore(preloadedState?: { postprocessing: PostprocessingState }) {
  return configureStore({
    reducer: {
      postprocessing: postprocessingReducer,
    },
    preloadedState,
  });
}

describe('postprocessingSlice', () => {
  describe('createViewConfiguration', () => {
    it('should create a new 3D view with default name', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));

      const state = store.getState().postprocessing;
      expect(state.viewConfigurations).toHaveLength(1);
      expect(state.viewConfigurations[0].name).toBe('Result View 1');
      expect(state.viewConfigurations[0].viewType).toBe('3D');
      expect(state.viewConfigurations[0].items).toEqual([]);
      expect(state.selectedViewId).toBe(state.viewConfigurations[0].id);
    });

    it('should create a new Line view with custom name', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ name: 'Custom View', viewType: 'Line' }));

      const state = store.getState().postprocessing;
      expect(state.viewConfigurations[0].name).toBe('Custom View');
      expect(state.viewConfigurations[0].viewType).toBe('Line');
    });

    it('should generate sequential default names', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      store.dispatch(createViewConfiguration({ viewType: '3D' }));

      const state = store.getState().postprocessing;
      expect(state.viewConfigurations[0].name).toBe('Result View 1');
      expect(state.viewConfigurations[1].name).toBe('Result View 2');
      expect(state.viewConfigurations[2].name).toBe('Result View 3');
    });

    it('should not create more than MAX_VIEW_CONFIGURATIONS views', () => {
      const store = createTestStore();

      // Create max views
      for (let i = 0; i < MAX_VIEW_CONFIGURATIONS; i++) {
        store.dispatch(createViewConfiguration({ viewType: '3D' }));
      }

      // Try to create one more
      store.dispatch(createViewConfiguration({ viewType: '3D' }));

      const state = store.getState().postprocessing;
      expect(state.viewConfigurations).toHaveLength(MAX_VIEW_CONFIGURATIONS);
    });

    it('should set createdAt and updatedAt timestamps', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));

      const view = store.getState().postprocessing.viewConfigurations[0];

      expect(view.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(view.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(view.createdAt).toBe(view.updatedAt); // Same timestamp on creation
    });
  });

  describe('deleteViewConfiguration', () => {
    it('should delete a view by ID', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      store.dispatch(createViewConfiguration({ viewType: '3D' }));

      const viewId = store.getState().postprocessing.viewConfigurations[0].id;
      store.dispatch(deleteViewConfiguration(viewId));

      const state = store.getState().postprocessing;
      expect(state.viewConfigurations).toHaveLength(1);
      expect(state.viewConfigurations[0].id).not.toBe(viewId);
    });

    it('should select next view after deleting selected view', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      store.dispatch(createViewConfiguration({ viewType: '3D' }));

      const firstViewId = store.getState().postprocessing.viewConfigurations[0].id;
      const secondViewId = store.getState().postprocessing.viewConfigurations[1].id;

      // Select first view
      store.dispatch(selectView(firstViewId));

      // Delete first view
      store.dispatch(deleteViewConfiguration(firstViewId));

      const state = store.getState().postprocessing;
      expect(state.selectedViewId).toBe(secondViewId);
    });

    it('should clear selection when deleting last view', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      store.dispatch(deleteViewConfiguration(viewId));

      const state = store.getState().postprocessing;
      expect(state.viewConfigurations).toHaveLength(0);
      expect(state.selectedViewId).toBeNull();
      expect(state.selectedItemId).toBeNull();
    });

    it('should do nothing if view ID does not exist', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const initialLength = store.getState().postprocessing.viewConfigurations.length;

      store.dispatch(deleteViewConfiguration('non-existent-id'));

      expect(store.getState().postprocessing.viewConfigurations).toHaveLength(initialLength);
    });
  });

  describe('renameViewConfiguration', () => {
    it('should rename a view', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      store.dispatch(renameViewConfiguration({ viewId, name: 'New Name' }));

      const view = store.getState().postprocessing.viewConfigurations[0];
      expect(view.name).toBe('New Name');
    });

    it('should update updatedAt timestamp', async () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;
      const oldUpdatedAt = store.getState().postprocessing.viewConfigurations[0].updatedAt;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));
      store.dispatch(renameViewConfiguration({ viewId, name: 'New Name' }));

      const newUpdatedAt = store.getState().postprocessing.viewConfigurations[0].updatedAt;
      expect(newUpdatedAt).not.toBe(oldUpdatedAt);
    });

    it('should do nothing if view ID does not exist', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ name: 'Original', viewType: '3D' }));

      store.dispatch(renameViewConfiguration({ viewId: 'non-existent', name: 'New Name' }));

      const view = store.getState().postprocessing.viewConfigurations[0];
      expect(view.name).toBe('Original');
    });
  });

  describe('selectView', () => {
    it('should select a view and clear item selection', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      // Add and select an item
      const item: Omit<ViewItem, 'id'> = {
        type: 'antenna-system',
        visible: true,
      };
      store.dispatch(addItemToView({ viewId, item }));
      const itemId = store.getState().postprocessing.viewConfigurations[0].items[0].id;
      store.dispatch(selectItem(itemId));

      // Create and select another view
      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const newViewId = store.getState().postprocessing.viewConfigurations[1].id;
      store.dispatch(selectView(newViewId));

      const state = store.getState().postprocessing;
      expect(state.selectedViewId).toBe(newViewId);
      expect(state.selectedItemId).toBeNull();
    });

    it('should allow selecting null', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      store.dispatch(selectView(null));

      expect(store.getState().postprocessing.selectedViewId).toBeNull();
    });
  });

  describe('addItemToView', () => {
    it('should add an item with auto-generated label', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = {
        type: 'field-magnitude',
        visible: true,
        fieldId: 'field-123',
        opacity: 0.5,
      };

      store.dispatch(addItemToView({ viewId, item }));

      const view = store.getState().postprocessing.viewConfigurations[0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].type).toBe('field-magnitude');
      expect(view.items[0].label).toBe('Field Magnitude');
      expect(view.items[0].fieldId).toBe('field-123');
      expect(view.items[0].opacity).toBe(0.5);
    });

    it('should add an item with custom label', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = {
        type: 'field-vector',
        visible: true,
        label: 'Custom Field Name',
      };

      store.dispatch(addItemToView({ viewId, item }));

      const view = store.getState().postprocessing.viewConfigurations[0];
      expect(view.items[0].label).toBe('Custom Field Name');
    });

    it('should generate sequential labels for duplicate item types', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = {
        type: 'single-antenna',
        visible: true,
      };

      store.dispatch(addItemToView({ viewId, item }));
      store.dispatch(addItemToView({ viewId, item }));
      store.dispatch(addItemToView({ viewId, item }));

      const view = store.getState().postprocessing.viewConfigurations[0];
      expect(view.items[0].label).toBe('Antenna');
      expect(view.items[1].label).toBe('Antenna 2');
      expect(view.items[2].label).toBe('Antenna 3');
    });

    it('should select the newly added item', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = {
        type: 'directivity',
        visible: true,
      };

      store.dispatch(addItemToView({ viewId, item }));

      const state = store.getState().postprocessing;
      expect(state.selectedItemId).toBe(state.viewConfigurations[0].items[0].id);
    });

    it('should do nothing if view ID does not exist', () => {
      const store = createTestStore();

      const item: Omit<ViewItem, 'id'> = {
        type: 'antenna-system',
        visible: true,
      };

      store.dispatch(addItemToView({ viewId: 'non-existent', item }));

      // Store should remain in initial state
      expect(store.getState().postprocessing.viewConfigurations).toHaveLength(0);
    });
  });

  describe('removeItemFromView', () => {
    it('should remove an item from a view', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item1: Omit<ViewItem, 'id'> = { type: 'antenna-system', visible: true };
      const item2: Omit<ViewItem, 'id'> = { type: 'directivity', visible: true };

      store.dispatch(addItemToView({ viewId, item: item1 }));
      store.dispatch(addItemToView({ viewId, item: item2 }));

      const itemId = store.getState().postprocessing.viewConfigurations[0].items[0].id;
      store.dispatch(removeItemFromView({ viewId, itemId }));

      const view = store.getState().postprocessing.viewConfigurations[0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].type).toBe('directivity');
    });

    it('should clear selection if removed item was selected', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = { type: 'antenna-system', visible: true };
      store.dispatch(addItemToView({ viewId, item }));

      const itemId = store.getState().postprocessing.selectedItemId!;
      store.dispatch(removeItemFromView({ viewId, itemId }));

      expect(store.getState().postprocessing.selectedItemId).toBeNull();
    });
  });

  describe('updateItemProperty', () => {
    it('should update item visibility', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = { type: 'antenna-system', visible: true };
      store.dispatch(addItemToView({ viewId, item }));

      const itemId = store.getState().postprocessing.viewConfigurations[0].items[0].id;
      store.dispatch(updateItemProperty({ viewId, itemId, property: 'visible', value: false }));

      const updatedItem = store.getState().postprocessing.viewConfigurations[0].items[0];
      expect(updatedItem.visible).toBe(false);
    });

    it('should update item opacity', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = { type: 'field-magnitude', visible: true, opacity: 0.5 };
      store.dispatch(addItemToView({ viewId, item }));

      const itemId = store.getState().postprocessing.viewConfigurations[0].items[0].id;
      store.dispatch(updateItemProperty({ viewId, itemId, property: 'opacity', value: 0.8 }));

      const updatedItem = store.getState().postprocessing.viewConfigurations[0].items[0];
      expect(updatedItem.opacity).toBe(0.8);
    });

    it('should update item label', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = { type: 'directivity', visible: true };
      store.dispatch(addItemToView({ viewId, item }));

      const itemId = store.getState().postprocessing.viewConfigurations[0].items[0].id;
      store.dispatch(updateItemProperty({ viewId, itemId, property: 'label', value: 'Custom Label' }));

      const updatedItem = store.getState().postprocessing.viewConfigurations[0].items[0];
      expect(updatedItem.label).toBe('Custom Label');
    });
  });

  describe('toggleItemVisibility', () => {
    it('should toggle item visibility from true to false', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = { type: 'antenna-system', visible: true };
      store.dispatch(addItemToView({ viewId, item }));

      const itemId = store.getState().postprocessing.viewConfigurations[0].items[0].id;
      store.dispatch(toggleItemVisibility({ viewId, itemId }));

      expect(store.getState().postprocessing.viewConfigurations[0].items[0].visible).toBe(false);
    });

    it('should toggle item visibility from false to true', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = { type: 'antenna-system', visible: false };
      store.dispatch(addItemToView({ viewId, item }));

      const itemId = store.getState().postprocessing.viewConfigurations[0].items[0].id;
      store.dispatch(toggleItemVisibility({ viewId, itemId }));

      expect(store.getState().postprocessing.viewConfigurations[0].items[0].visible).toBe(true);
    });
  });

  describe('setViewFrequency', () => {
    it('should set frequency for 3D view', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      store.dispatch(setViewFrequency({ viewId, frequencyHz: 300e6 }));

      const view = store.getState().postprocessing.viewConfigurations[0];
      expect(view.selectedFrequencyHz).toBe(300e6);
    });

    it('should not set frequency for Line view', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: 'Line' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      store.dispatch(setViewFrequency({ viewId, frequencyHz: 300e6 }));

      const view = store.getState().postprocessing.viewConfigurations[0];
      expect(view.selectedFrequencyHz).toBeUndefined();
    });
  });

  describe('loadViewConfigurations', () => {
    it('should load views from database', () => {
      const store = createTestStore();

      const mockViews: ViewConfiguration[] = [
        {
          id: 'view-1',
          name: 'Loaded View 1',
          viewType: '3D',
          items: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'view-2',
          name: 'Loaded View 2',
          viewType: 'Line',
          items: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      store.dispatch(loadViewConfigurations(mockViews));

      const state = store.getState().postprocessing;
      expect(state.viewConfigurations).toHaveLength(2);
      expect(state.viewConfigurations[0].name).toBe('Loaded View 1');
      expect(state.viewConfigurations[1].name).toBe('Loaded View 2');
    });

    it('should auto-select first view if none selected', () => {
      const store = createTestStore();

      const mockViews: ViewConfiguration[] = [
        {
          id: 'view-1',
          name: 'View 1',
          viewType: '3D',
          items: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      store.dispatch(loadViewConfigurations(mockViews));

      expect(store.getState().postprocessing.selectedViewId).toBe('view-1');
    });
  });

  describe('clearViewConfigurations', () => {
    it('should clear all views and selections', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      store.dispatch(createViewConfiguration({ viewType: 'Line' }));

      store.dispatch(clearViewConfigurations());

      const state = store.getState().postprocessing;
      expect(state.viewConfigurations).toHaveLength(0);
      expect(state.selectedViewId).toBeNull();
      expect(state.selectedItemId).toBeNull();
    });
  });

  describe('dialog state management', () => {
    it('should toggle add view dialog', () => {
      const store = createTestStore();

      store.dispatch(setAddViewDialogOpen(true));
      expect(store.getState().postprocessing.addViewDialogOpen).toBe(true);

      store.dispatch(setAddViewDialogOpen(false));
      expect(store.getState().postprocessing.addViewDialogOpen).toBe(false);
    });
  });

  describe('selectors', () => {
    it('selectViewConfigurations should return all views', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      store.dispatch(createViewConfiguration({ viewType: 'Line' }));

      const views = selectViewConfigurations(store.getState());
      expect(views).toHaveLength(2);
    });

    it('selectSelectedView should return selected view', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ name: 'Test View', viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      store.dispatch(selectView(viewId));

      const selectedView = selectSelectedView(store.getState());
      expect(selectedView?.name).toBe('Test View');
    });

    it('selectSelectedViewItems should return items of selected view', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = { type: 'antenna-system', visible: true };
      store.dispatch(addItemToView({ viewId, item }));

      const items = selectSelectedViewItems(store.getState());
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('antenna-system');
    });

    it('selectSelectedItem should return selected item', () => {
      const store = createTestStore();

      store.dispatch(createViewConfiguration({ viewType: '3D' }));
      const viewId = store.getState().postprocessing.viewConfigurations[0].id;

      const item: Omit<ViewItem, 'id'> = { type: 'directivity', visible: true };
      store.dispatch(addItemToView({ viewId, item }));

      const selectedItem = selectSelectedItem(store.getState());
      expect(selectedItem?.type).toBe('directivity');
    });
  });
});
