import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import ResultsPage from '../ResultsPage';
import projectsReducer from '@/store/projectsSlice';
import designReducer from '@/store/designSlice';
import solverReducer from '@/store/solverSlice';
import uiReducer from '@/store/uiSlice';

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ projectId: '1' }),
    useNavigate: () => vi.fn(),
  };
});

// Mock child components
vi.mock('../SolutionDataPanel', () => ({
  default: () => <div data-testid="solution-data-panel">Solution Data Panel</div>,
}));

vi.mock('../ResultsVisualizationPanel', () => ({
  default: () => <div data-testid="results-visualization-panel">Results Visualization Panel</div>,
}));

const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      projects: projectsReducer,
      design: designReducer,
      solver: solverReducer,
      ui: uiReducer,
    },
    preloadedState: initialState,
  });
};

describe('ResultsPage', () => {
  describe('No Results State', () => {
    it('should show "No Results Available" when no solve results exist', () => {
      const store = createTestStore({
        projects: {
          items: [{ id: 1, name: 'Test Project', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
          currentProject: { id: 1, name: 'Test Project', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          loading: false,
          error: null,
        },
        design: {
          elements: [],
          mesh: null,
          selectedElementId: null,
          sources: [],
          lumpedElements: [],
          antennaType: null,
          meshGenerating: false,
        },
        solver: {
          status: 'idle',
          progress: 0,
          error: null,
          jobId: null,
          currentRequest: null,
          results: null,
          currentDistribution: null,
          radiationPattern: null,
          multiAntennaResults: null,
          frequencySweep: [],
          sweepInProgress: false,
          sweepProgress: 0,
        },
        ui: {
          theme: 'light',
          sidebarOpen: true,
          notifications: [],
          modals: {},
        },
      });

      render(
        <Provider store={store}>
          <BrowserRouter>
            <ResultsPage />
          </BrowserRouter>
        </Provider>
      );

      expect(screen.getByText('No Results Available')).toBeInTheDocument();
      expect(screen.getByText(/Run a simulation from the Design page/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Go to Design/i })).toBeInTheDocument();
    });
  });

  describe('With Results', () => {
    it('should render both panels when results are available', () => {
      const store = createTestStore({
        projects: {
          items: [{ id: 1, name: 'Test Project', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
          currentProject: { id: 1, name: 'Test Project', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          loading: false,
          error: null,
        },
        design: {
          elements: [],
          mesh: {
            nodes: [[0, 0, 0], [1, 0, 0]],
            edges: [[0, 1]],
            metadata: {},
          },
          selectedElementId: null,
          sources: [],
          lumpedElements: [],
          antennaType: null,
          meshGenerating: false,
        },
        solver: {
          status: 'completed',
          progress: 100,
          error: null,
          jobId: null,
          currentRequest: null,
          results: {
            frequency: 300e6,
            impedance: { real: 50, imag: 0 },
            currents: [],
          },
          currentDistribution: [1.0, 0.8, 0.6],
          radiationPattern: {
            frequency: 300e6,
            theta_angles: [],
            phi_angles: [],
            E_theta_mag: [],
            E_phi_mag: [],
            E_total_mag: [],
            pattern_db: [],
            directivity: 2.15,
            gain: 2.15,
            efficiency: 1.0,
            max_direction: [0, 0],
          },
          multiAntennaResults: null,
          frequencySweep: [],
          sweepInProgress: false,
          sweepProgress: 0,
        },
        ui: {
          theme: 'light',
          sidebarOpen: true,
          notifications: [],
          modals: {},
        },
      });

      render(
        <Provider store={store}>
          <BrowserRouter>
            <ResultsPage />
          </BrowserRouter>
        </Provider>
      );

      expect(screen.getByTestId('solution-data-panel')).toBeInTheDocument();
      expect(screen.getByTestId('results-visualization-panel')).toBeInTheDocument();
      expect(screen.getByText(/Results: Test Project/i)).toBeInTheDocument();
    });

    it('should display export menu button', () => {
      const store = createTestStore({
        projects: {
          items: [{ id: 1, name: 'Test Project', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
          currentProject: { id: 1, name: 'Test Project', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          loading: false,
          error: null,
        },
        design: {
          elements: [],
          mesh: { nodes: [[0, 0, 0]], edges: [], metadata: {} },
          selectedElementId: null,
          sources: [],
          lumpedElements: [],
          antennaType: null,
          meshGenerating: false,
        },
        solver: {
          status: 'completed',
          progress: 100,
          error: null,
          jobId: null,
          currentRequest: null,
          results: { frequency: 300e6, impedance: { real: 50, imag: 0 }, currents: [] },
          currentDistribution: [1.0],
          radiationPattern: null,
          multiAntennaResults: null,
          frequencySweep: [],
          sweepInProgress: false,
          sweepProgress: 0,
        },
        ui: {
          theme: 'light',
          sidebarOpen: true,
          notifications: [],
          modals: {},
        },
      });

      render(
        <Provider store={store}>
          <BrowserRouter>
            <ResultsPage />
          </BrowserRouter>
        </Provider>
      );

      expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner while loading', () => {
      const store = createTestStore({
        projects: {
          items: [],
          currentProject: null,
          loading: true,
          error: null,
        },
        design: {
          elements: [],
          mesh: null,
          selectedElementId: null,
          sources: [],
          lumpedElements: [],
          antennaType: null,
          meshGenerating: false,
        },
        solver: {
          status: 'idle',
          progress: 0,
          error: null,
          jobId: null,
          currentRequest: null,
          results: null,
          currentDistribution: null,
          radiationPattern: null,
          multiAntennaResults: null,
          frequencySweep: [],
          sweepInProgress: false,
          sweepProgress: 0,
        },
        ui: {
          theme: 'light',
          sidebarOpen: true,
          notifications: [],
          modals: {},
        },
      });

      render(
        <Provider store={store}>
          <BrowserRouter>
            <ResultsPage />
          </BrowserRouter>
        </Provider>
      );

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });
});
