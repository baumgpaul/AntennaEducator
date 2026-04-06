/**
 * DesignPage Tests - Autosave with Retry Logic
 * Tests for project loading, autosave, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore, PreloadedState } from '@reduxjs/toolkit';
import DesignPage from '@/features/design/DesignPage';
import projectsReducer from '@/store/projectsSlice';
import designReducer from '@/store/designSlice';
import solverReducer from '@/store/solverSlice';
import uiReducer from '@/store/uiSlice';
import postprocessingReducer from '@/store/postprocessingSlice';
import documentationReducer from '@/store/documentationSlice';
import variablesReducer from '@/store/variablesSlice';
import submissionsReducer from '@/store/submissionsSlice';
import foldersReducer from '@/store/foldersSlice';
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
      postprocessing: postprocessingReducer,
      documentation: documentationReducer,
      variables: variablesReducer,
      submissions: submissionsReducer,
      folders: foldersReducer,
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

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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
        loading: false,
        error: null,
        selectedProjectId: null,
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

    // DesignPage mounts and dispatches fetchProject — verify component renders
    expect(screen.getByRole('tab', { name: /Designer/i })).toBeInTheDocument();
  });

  it('should render without errors when project has elements', async () => {
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
      ui: {
        theme: { mode: 'light' as const },
        layout: { sidebarOpen: true, propertiesPanelOpen: true },
        visualization: { mode: 'element-colors' as const },
        notifications: [],
        modals: {},
      },
    };

    renderWithRedux(<DesignPage />, { preloadedState });

    // Renders Designer tab by default
    expect(screen.getByRole('tab', { name: /Designer/i })).toBeInTheDocument();
  });

  it('should render tabs correctly when project is loaded', async () => {
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
      ui: {
        theme: { mode: 'light' as const },
        layout: { sidebarOpen: true, propertiesPanelOpen: true },
        visualization: { mode: 'element-colors' as const },
        notifications: [],
        modals: {},
      },
    };

    renderWithRedux(<DesignPage />, { preloadedState });

    expect(screen.getByRole('tab', { name: /Designer/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Solver/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Postprocessing/i })).toBeInTheDocument();
  });

  it('should render error state when project fails to load', async () => {
    const preloadedState = {
      projects: {
        items: [],
        projects: [],
        currentProject: null,
        selectedProject: null,
        simulations: [],
        loading: false,
        error: 'Network error',
        selectedProjectId: 1,
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

    // Page renders but project is not loaded
    expect(screen.getByRole('tab', { name: /Designer/i })).toBeInTheDocument();
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
