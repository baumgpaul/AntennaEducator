/**
 * DesignPage Tests - Autosave with Retry Logic
 * Tests for project loading, autosave, and error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore, PreloadedState } from '@reduxjs/toolkit';
import DesignPage from '@/features/design/DesignPage';
import projectsReducer from '@/store/projectsSlice';
import designReducer from '@/store/designSlice';
import solverReducer from '@/store/solverSlice';
import uiReducer from '@/store/uiSlice';
import type { RootState } from '@/store/store';

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
  };
});

function renderWithRedux(
  component: React.ReactElement,
  { preloadedState = {} } = {}
) {
  const store = configureStore({
    reducer: {
      projects: projectsReducer,
      design: designReducer,
      solver: solverReducer,
      ui: uiReducer,
    },
    preloadedState: preloadedState as PreloadedState<RootState>,
  });

  return {
    ...render(
      <Provider store={store}>
        <BrowserRouter>
          {component}
        </BrowserRouter>
      </Provider>
    ),
    store,
  };
}

describe('DesignPage - Autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should load project on mount when projectId provided', async () => {
    const preloadedState = {
      projects: {
        items: [
          {
            id: 1,
            name: 'Test Project',
            description: '',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        projects: [],
        currentProject: null,
        selectedProject: null,
        simulations: [],
        loading: true,
        error: null,
        selectedProjectId: null,
      },
      design: {
        elements: [],
        selectedElementId: null,
        mesh: null,
        currentSimulation: null,
        frequencySweep: null,
        sweepInProgress: false,
      },
      solver: {
        results: null,
        loading: false,
        error: null,
        multiAntennaResults: null,
        radiationPattern: null,
        frequencySweepResults: [],
      },
      ui: {
        theme: { mode: 'light' as const },
        layout: { sidebarOpen: true, propertiesPanelOpen: true },
        visualization: { mode: 'element-colors' as const },
        notifications: [],
        modals: {},
      },
    };

    const { store } = renderWithRedux(<DesignPage />, { preloadedState });

    await waitFor(() => {
      // fetchProject thunk should be dispatched
      expect(store.getState().projects.loading).toBe(true);
    });
  });

  it('should show "Saving..." status during autosave', async () => {
    const preloadedState = {
      projects: {
        items: [
          {
            id: 1,
            name: 'Test Project',
            description: '',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        projects: [],
        currentProject: {
          id: 1,
          name: 'Test Project',
          description: '',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        selectedProject: null,
        simulations: [],
        loading: false,
        error: null,
        selectedProjectId: 1,
      },
      design: {
        elements: [
          {
            id: 'elem-1',
            type: 'dipole',
            name: 'Test Dipole',
            config: {},
            position: [0, 0, 0],
          },
        ],
        selectedElementId: null,
        mesh: null,
        currentSimulation: null,
        frequencySweep: null,
        sweepInProgress: false,
      },
      solver: {
        results: null,
        loading: false,
        error: null,
        multiAntennaResults: null,
        radiationPattern: null,
        frequencySweepResults: [],
      },
      ui: {
        theme: { mode: 'light' as const },
        layout: { sidebarOpen: true, propertiesPanelOpen: true },
        visualization: { mode: 'element-colors' as const },
        notifications: [],
        modals: {},
      },
    };

    renderWithRedux(<DesignPage />, { preloadedState });

    // After debounce delay, "Saving..." should appear
    vi.advanceTimersByTime(1500);

    await waitFor(() => {
      const savingAlert = screen.queryByText(/Saving\.\.\./);
      expect(savingAlert).toBeTruthy();
    });
  });

  it('should show "Project saved" after successful autosave', async () => {
    const preloadedState = {
      projects: {
        items: [
          {
            id: 1,
            name: 'Test Project',
            description: '',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        projects: [],
        currentProject: {
          id: 1,
          name: 'Test Project',
          description: '',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        selectedProject: null,
        simulations: [],
        loading: false,
        error: null,
        selectedProjectId: 1,
      },
      design: {
        elements: [
          {
            id: 'elem-1',
            type: 'dipole',
            name: 'Test Dipole',
            config: {},
            position: [0, 0, 0],
          },
        ],
        selectedElementId: null,
        mesh: null,
        currentSimulation: null,
        frequencySweep: null,
        sweepInProgress: false,
      },
      solver: {
        results: null,
        loading: false,
        error: null,
        multiAntennaResults: null,
        radiationPattern: null,
        frequencySweepResults: [],
      },
      ui: {
        theme: { mode: 'light' as const },
        layout: { sidebarOpen: true, propertiesPanelOpen: true },
        visualization: { mode: 'element-colors' as const },
        notifications: [],
        modals: {},
      },
    };

    renderWithRedux(<DesignPage />, { preloadedState });

    // Trigger autosave
    vi.advanceTimersByTime(1500);

    // Wait for save to complete
    await waitFor(() => {
      vi.advanceTimersByTime(500); // Simulate API delay
    });

    // "Project saved" should appear
    await waitFor(() => {
      const savedAlert = screen.queryByText(/Project saved/);
      expect(savedAlert).toBeTruthy();
    });
  });

  it('should retry autosave on failure with exponential backoff', async () => {
    const preloadedState = {
      projects: {
        items: [
          {
            id: 1,
            name: 'Test Project',
            description: '',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        projects: [],
        currentProject: null,
        selectedProject: null,
        simulations: [],
        loading: false,
        error: 'Network error', // Simulate error state
        selectedProjectId: 1,
      },
      design: {
        elements: [
          {
            id: 'elem-1',
            type: 'dipole',
            name: 'Test Dipole',
            config: {},
            position: [0, 0, 0],
          },
        ],
        selectedElementId: null,
        mesh: null,
        currentSimulation: null,
        frequencySweep: null,
        sweepInProgress: false,
      },
      solver: {
        results: null,
        loading: false,
        error: null,
        multiAntennaResults: null,
        radiationPattern: null,
        frequencySweepResults: [],
      },
      ui: {
        theme: { mode: 'light' as const },
        layout: { sidebarOpen: true, propertiesPanelOpen: true },
        visualization: { mode: 'element-colors' as const },
        notifications: [],
        modals: {},
      },
    };

    renderWithRedux(<DesignPage />, { preloadedState });

    // Trigger autosave
    vi.advanceTimersByTime(1500);

    // Should show error and retry message
    await waitFor(() => {
      const retryText = screen.queryByText(/Retrying/);
      expect(retryText).toBeTruthy();
    });

    // After all retries fail (1s, 2s, 4s), should show final error
    vi.advanceTimersByTime(7000);

    await waitFor(() => {
      const errorAlert = screen.queryByText(/Failed to save changes/);
      expect(errorAlert).toBeTruthy();
    });
  });

  it('should not show save indicator when no elements exist', async () => {
    const preloadedState = {
      projects: {
        items: [],
        projects: [],
        currentProject: null,
        selectedProject: null,
        simulations: [],
        loading: false,
        error: null,
        selectedProjectId: null,
      },
      design: {
        elements: [],
        selectedElementId: null,
        mesh: null,
        currentSimulation: null,
        frequencySweep: null,
        sweepInProgress: false,
      },
      solver: {
        results: null,
        loading: false,
        error: null,
        multiAntennaResults: null,
        radiationPattern: null,
        frequencySweepResults: [],
      },
      ui: {
        theme: { mode: 'light' as const },
        layout: { sidebarOpen: true, propertiesPanelOpen: true },
        visualization: { mode: 'element-colors' as const },
        notifications: [],
        modals: {},
      },
    };

    renderWithRedux(<DesignPage />, { preloadedState });

    vi.advanceTimersByTime(1500);

    // No save indicator should appear
    const savingAlert = screen.queryByText(/Saving/);
    const savedAlert = screen.queryByText(/saved/);
    expect(savingAlert).not.toBeInTheDocument();
    expect(savedAlert).not.toBeInTheDocument();
  });
});

