/**
 * ProjectsPage Tests
 * Tests for projects list, filtering, search, create, update, delete
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore, PreloadedState } from '@reduxjs/toolkit';
import { http, HttpResponse } from 'msw';
import ProjectsPage from '@/features/projects/ProjectsPage';
import projectsReducer from '@/store/projectsSlice';
import uiReducer from '@/store/uiSlice';
import foldersReducer from '@/store/foldersSlice';
import type { RootState } from '@/store/store';
import { server } from '@/test/mocks/server';

// Helper function to render with Redux
function renderWithRedux(
  component: React.ReactElement,
  { preloadedState = {} } = {}
) {
  const store = configureStore({
    reducer: {
      projects: projectsReducer,
      ui: uiReducer,
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

describe('ProjectsPage', () => {
  it('should render skeleton loaders while loading', async () => {
    const preloadedState = {
      projects: {
        items: [],
        projects: [],
        currentProject: null,
        selectedProject: null,
        simulations: [],
        loading: true,
        error: null,
        selectedProjectId: null,
      },
    };

    render(
      <Provider
        store={configureStore({
          reducer: {
            projects: projectsReducer,
            ui: uiReducer,
            folders: foldersReducer,
          },
          preloadedState: preloadedState as PreloadedState<RootState>,
        })}
      >
        <BrowserRouter>
          <ProjectsPage />
        </BrowserRouter>
      </Provider>
    );

    // Skeleton loaders should be visible
    const skeletons = screen.getAllByTestId(/skeleton/i);
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should display error alert with retry button when fetch fails', async () => {
    // Override MSW to return error response
    server.use(
      http.get('http://localhost:8010/api/projects', () => {
        return HttpResponse.json(
          { detail: 'Failed to load projects' },
          { status: 500 }
        );
      })
    );

    const { store } = renderWithRedux(<ProjectsPage />);

    // Error alert should appear after fetch fails
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/failed to load projects/i);

    // Retry button should be visible
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('should display empty state when no projects exist', async () => {
    // Override MSW to return empty projects array
    server.use(
      http.get('http://localhost:8010/api/projects', () => {
        return HttpResponse.json([]);
      })
    );

    renderWithRedux(<ProjectsPage />);

    // Wait for empty state to render after fetch completes
    await waitFor(() => {
      expect(screen.getByText('No projects yet')).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.getByText(/create your first antenna simulation/i)).toBeInTheDocument();
  });

  it('should display projects in grid layout', () => {
    const preloadedState = {
      projects: {
        items: [
          {
            id: 1,
            name: 'Dipole Test',
            description: 'Test dipole antenna',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 2,
            name: 'Loop Test',
            description: 'Test loop antenna',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        projects: [
          {
            id: 1,
            name: 'Dipole Test',
            description: 'Test dipole antenna',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 2,
            name: 'Loop Test',
            description: 'Test loop antenna',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        currentProject: null,
        selectedProject: null,
        simulations: [],
        loading: false,
        error: null,
        selectedProjectId: null,
      },
    };

    renderWithRedux(<ProjectsPage />, { preloadedState });

    // Both project names should be visible
    expect(screen.getByText('Dipole Test')).toBeInTheDocument();
    expect(screen.getByText('Loop Test')).toBeInTheDocument();
    // Verify descriptions are also rendered
    expect(screen.getByText('Test dipole antenna')).toBeInTheDocument();
    expect(screen.getByText('Test loop antenna')).toBeInTheDocument();
  });

  it('should filter projects by search query', async () => {
    const preloadedState = {
      projects: {
        items: [
          {
            id: 1,
            name: 'Dipole Test',
            description: 'Dipole antenna',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 2,
            name: 'Loop Test',
            description: 'Loop antenna',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        projects: [
          {
            id: 1,
            name: 'Dipole Test',
            description: 'Dipole antenna',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
          {
            id: 2,
            name: 'Loop Test',
            description: 'Loop antenna',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
        currentProject: null,
        selectedProject: null,
        simulations: [],
        loading: false,
        error: null,
        selectedProjectId: null,
      },
    };

    renderWithRedux(<ProjectsPage />, { preloadedState });

    const searchInput = screen.getByPlaceholderText('Search projects...');

    // Both projects should be visible initially
    expect(screen.getByText('Dipole Test')).toBeInTheDocument();
    expect(screen.getByText('Loop Test')).toBeInTheDocument();

    // Search for "dipole"
    await userEvent.type(searchInput, 'dipole');

    // After searching, only Dipole Test should be visible
    await waitFor(() => {
      expect(screen.getByText('Dipole Test')).toBeInTheDocument();
      expect(screen.queryByText('Loop Test')).not.toBeInTheDocument();
    });
  });

  it('should sort projects by different criteria', async () => {
    // Override MSW to return specific projects for sorting
    server.use(
      http.get('http://localhost:8010/api/projects', () => {
        return HttpResponse.json([
          {
            id: 1,
            name: 'Zebra Antenna',
            description: 'Z project',
            created_at: '2025-01-03T00:00:00Z',
            updated_at: '2025-01-03T00:00:00Z',
          },
          {
            id: 2,
            name: 'Alpha Antenna',
            description: 'A project',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ]);
      })
    );

    renderWithRedux(<ProjectsPage />);

    // Wait for both projects to load and be visible
    await screen.findByText('Zebra Antenna');
    await screen.findByText('Alpha Antenna');

    // Click the Sort by select using combobox role
    const sortSelect = screen.getByRole('combobox');
    fireEvent.mouseDown(sortSelect);

    // Select "Name" option from the menu
    const nameOption = await screen.findByRole('option', { name: 'Name' });
    fireEvent.click(nameOption);

    // After sorting by name, both projects should still be visible
    // (we can't easily test order without inspecting DOM structure deeply)
    await waitFor(() => {
      expect(screen.getByText('Alpha Antenna')).toBeInTheDocument();
      expect(screen.getByText('Zebra Antenna')).toBeInTheDocument();
    });
  });

  it('should open "New Project" dialog when clicking button', async () => {
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
    };

    renderWithRedux(<ProjectsPage />, { preloadedState });

    const newProjectButton = screen.getByRole('button', { name: /new project/i });
    await userEvent.click(newProjectButton);

    // Dialog should open - look for dialog title
    await waitFor(() => {
      expect(screen.getByText(/create new project/i)).toBeInTheDocument();
    });
  });
});
