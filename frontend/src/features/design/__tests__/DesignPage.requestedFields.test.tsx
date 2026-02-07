/**
 * Tests for requested fields persistence in DesignPage
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import DesignPage from '../DesignPage';
import designReducer from '@/store/designSlice';
import solverReducer from '@/store/solverSlice';
import projectsReducer from '@/store/projectsSlice';
import uiReducer from '@/store/uiSlice';
import postprocessingReducer from '@/store/postprocessingSlice';
import * as projectsApi from '@/api/projects';
import type { FieldDefinition } from '@/types/fieldDefinitions';

// Mock the API
vi.mock('@/api/projects');
vi.mock('@/api/preprocessor');
vi.mock('@/api/solver');
vi.mock('@/api/postprocessor');

// Sample field definitions
const sampleFields: FieldDefinition[] = [
  {
    id: 'field-1',
    type: '2D',
    shape: 'plane',
    centerPoint: [0, 0, 0],
    dimensions: { width: 1, height: 1 },
    normalPreset: 'XY',
    sampling: { x: 20, y: 20 },
    farField: false,
    fieldType: 'E',
    visible: true,
    name: 'E-field plane',
  },
  {
    id: 'field-2',
    type: '3D',
    shape: 'sphere',
    centerPoint: [0, 0, 1],
    sphereRadius: 1.5,
    sampling: { radial: 10, angular: 20 },
    farField: false,
    fieldType: 'poynting',
    visible: true,
  },
];

// Create a test store
function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: {
      design: designReducer,
      solver: solverReducer,
      projects: projectsReducer,
      ui: uiReducer,
      postprocessing: postprocessingReducer,
    },
    preloadedState,
  });
}

// Helper to render with store and router
function renderWithProviders(
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = createTestStore(preloadedState),
    initialEntries = ['/project/1/design'],
  } = {}
) {
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/project/:projectId/design" element={ui} />
          </Routes>
        </MemoryRouter>
      </Provider>
    ),
  };
}

describe('DesignPage - Field Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Loading fields from project', () => {
    it('should load requested_fields when project loads', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        simulation_config: { requested_fields: sampleFields },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      // Wait for project to load
      await waitFor(() => {
        const state = store.getState();
        expect(state.solver.requestedFields).toHaveLength(2);
      });

      const state = store.getState();
      expect(state.solver.requestedFields[0].id).toBe('field-1');
      expect(state.solver.requestedFields[1].shape).toBe('sphere');
    });

    it('should handle project with no requested_fields', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      await waitFor(() => {
        const state = store.getState();
        expect(state.projects.currentProject).toBeTruthy();
      });

      const state = store.getState();
      expect(state.solver.requestedFields).toEqual([]);
    });

    it('should handle project with empty requested_fields array', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        simulation_config: { requested_fields: [] },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      await waitFor(() => {
        const state = store.getState();
        expect(state.projects.currentProject).toBeTruthy();
      });

      const state = store.getState();
      expect(state.solver.requestedFields).toEqual([]);
    });

    it('should clear fields when switching to different project', async () => {
      const mockProject1 = {
        id: 1,
        name: 'Project 1',
        description: '',
        simulation_config: { requested_fields: sampleFields },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      const mockProject2 = {
        id: 2,
        name: 'Project 2',
        description: '',
        simulation_config: { requested_fields: [] },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      // Load first project
      vi.mocked(projectsApi.getProject).mockResolvedValueOnce(mockProject1);
      const { store, unmount } = renderWithProviders(<DesignPage />, {
        initialEntries: ['/project/1/design'],
      });

      await waitFor(() => {
        expect(store.getState().solver.requestedFields).toHaveLength(2);
      });

      // Unmount first page, mount second with new projectId
      unmount();

      vi.mocked(projectsApi.getProject).mockResolvedValueOnce(mockProject2);
      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/project/2/design']}>
            <Routes>
              <Route path="/project/:projectId/design" element={<DesignPage />} />
            </Routes>
          </MemoryRouter>
        </Provider>
      );

      await waitFor(() => {
        const state = store.getState();
        expect(state.projects.currentProject?.id).toBe(2);
      });

      // Fields should be cleared for project 2
      await waitFor(() => {
        expect(store.getState().solver.requestedFields).toEqual([]);
      });
    });
  });

  describe('Auto-saving fields', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      cleanup();
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('should include requested_fields in auto-save', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        simulation_config: { requested_fields: [] },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      vi.mocked(projectsApi.updateProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      // Flush microtasks so mocked getProject resolves
      await vi.advanceTimersByTimeAsync(0);

      // Wait for project to appear in store
      expect(store.getState().projects.currentProject).toBeTruthy();

      // Flush any initial debounce from project load
      await vi.advanceTimersByTimeAsync(2000);
      vi.mocked(projectsApi.updateProject).mockClear();

      // Add a field to Redux state
      store.dispatch({
        type: 'solver/addFieldRegion',
        payload: sampleFields[0],
      });

      // Wait for debounce (1.5 seconds)
      await vi.advanceTimersByTimeAsync(1600);

      // Verify the update included requested_fields inside simulation_config
      const updateCall = vi.mocked(projectsApi.updateProject).mock.calls[0];
      expect(updateCall[1].simulation_config).toBeDefined();
      expect(updateCall[1].simulation_config.requested_fields).toHaveLength(1);
      expect(updateCall[1].simulation_config.requested_fields[0].id).toBe('field-1');
    });

    it('should debounce multiple field changes', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        simulation_config: { requested_fields: [] },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      vi.mocked(projectsApi.updateProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      // Flush microtasks so mocked getProject resolves
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getState().projects.currentProject).toBeTruthy();

      // Flush any initial debounce
      await vi.advanceTimersByTimeAsync(2000);
      vi.mocked(projectsApi.updateProject).mockClear();

      // Add multiple fields rapidly
      store.dispatch({ type: 'solver/addFieldRegion', payload: sampleFields[0] });
      await vi.advanceTimersByTimeAsync(500);
      store.dispatch({ type: 'solver/addFieldRegion', payload: sampleFields[1] });
      await vi.advanceTimersByTimeAsync(500);

      // Should not have saved yet (debounced)
      expect(projectsApi.updateProject).not.toHaveBeenCalled();

      // Wait for full debounce
      await vi.advanceTimersByTimeAsync(1600);

      // Should save both fields in one call
      const updateCall = vi.mocked(projectsApi.updateProject).mock.calls[0];
      expect(updateCall[1].simulation_config.requested_fields).toHaveLength(2);
    });

    it('should save when fields are deleted', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        simulation_config: { requested_fields: sampleFields },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      vi.mocked(projectsApi.updateProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      // Flush microtasks so mocked getProject resolves and fields are loaded
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getState().solver.requestedFields).toHaveLength(2);

      // Flush the initial auto-save debounce triggered by field loading
      await vi.advanceTimersByTimeAsync(2000);
      vi.mocked(projectsApi.updateProject).mockClear();

      // Delete a field
      store.dispatch({ type: 'solver/deleteFieldRegion', payload: 'field-1' });

      // Wait for debounce
      await vi.advanceTimersByTimeAsync(1600);

      // Should save with one field removed
      const updateCall = vi.mocked(projectsApi.updateProject).mock.calls[0];
      expect(updateCall[1].simulation_config.requested_fields).toHaveLength(1);
      expect(updateCall[1].simulation_config.requested_fields[0].id).toBe('field-2');
    });

    it('should save when field properties change', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        simulation_config: { requested_fields: sampleFields },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
      vi.mocked(projectsApi.updateProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      // Flush microtasks so mocked getProject resolves and fields are loaded
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getState().solver.requestedFields).toHaveLength(2);

      // Flush the initial auto-save debounce triggered by field loading
      await vi.advanceTimersByTimeAsync(2000);
      vi.mocked(projectsApi.updateProject).mockClear();

      // Update a field property
      store.dispatch({
        type: 'solver/updateFieldRegion',
        payload: {
          id: 'field-1',
          updates: { name: 'Renamed Field', visible: false },
        },
      });

      // Wait for debounce
      await vi.advanceTimersByTimeAsync(1600);

      // Should save with updated field
      const updateCall = vi.mocked(projectsApi.updateProject).mock.calls[0];
      expect(updateCall[1].simulation_config.requested_fields[0].name).toBe('Renamed Field');
      expect(updateCall[1].simulation_config.requested_fields[0].visible).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle null requested_fields gracefully', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        simulation_config: { requested_fields: null as any },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      await waitFor(() => {
        const state = store.getState();
        expect(state.projects.currentProject).toBeTruthy();
      });

      // Should default to empty array
      const state = store.getState();
      expect(state.solver.requestedFields).toEqual([]);
    });

    it('should handle malformed requested_fields', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: '',
        simulation_config: { requested_fields: 'not an array' as any },
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };

      vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);

      const { store } = renderWithProviders(<DesignPage />);

      await waitFor(() => {
        const state = store.getState();
        expect(state.projects.currentProject).toBeTruthy();
      });

      // Should default to empty array
      const state = store.getState();
      expect(state.solver.requestedFields).toEqual([]);
    });
  });
});
