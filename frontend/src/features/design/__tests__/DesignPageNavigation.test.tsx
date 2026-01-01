import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import DesignPage from '../DesignPage';
import projectsReducer from '@/store/projectsSlice';
import designReducer from '@/store/designSlice';
import solverReducer from '@/store/solverSlice';
import uiReducer from '@/store/uiSlice';

// Create mock navigate function at module level
const mockNavigate = vi.fn();

// Mock react-router-dom at module level
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ projectId: '1' }),
  };
});

// Mock child components
vi.mock('../ElementPanel', () => ({
  default: () => <div data-testid="element-panel">Element Panel</div>,
}));

vi.mock('../DesignCanvas', () => ({
  default: () => <div data-testid="design-canvas">Design Canvas</div>,
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

describe('DesignPage Results Navigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe('View Results Action', () => {
    it('should render without errors when results exist', () => {
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
          status: 'completed',
          progress: 100,
          error: null,
          jobId: null,
          currentRequest: null,
          results: { frequency: 300e6, impedance: { real: 50, imag: 0 }, currents: [] },
          currentDistribution: [1.0],
          radiationPattern: null,
          multiAntennaResults: null,
          frequencySweep: null,
          sweepInProgress: false,
          resultsHistory: [],
          requestedFields: [],
          directivityRequested: false,
          directivitySettings: { theta_points: 19, phi_points: 37 },
          solverState: 'idle',
          currentFrequency: null,
          fieldResults: null,
          postprocessingStatus: 'idle',
          postprocessingProgress: null,
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
            <DesignPage />
          </BrowserRouter>
        </Provider>
      );

      // Just check that it renders successfully with results
      expect(screen.getByRole('tab', { name: /Designer/i })).toBeInTheDocument();
    });

    it('should render without errors when no results exist', () => {
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
          frequencySweep: null,
          sweepInProgress: false,
          resultsHistory: [],
          requestedFields: [],
          directivityRequested: false,
          directivitySettings: { theta_points: 19, phi_points: 37 },
          solverState: 'idle',
          currentFrequency: null,
          fieldResults: null,
          postprocessingStatus: 'idle',
          postprocessingProgress: null,
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
            <DesignPage />
          </BrowserRouter>
        </Provider>
      );

      // Just check that it renders successfully without results
      expect(screen.getByRole('tab', { name: /Solver/i })).toBeInTheDocument();
    });
  });

  describe('Solver Action with Auto-Navigation', () => {
    it('should render without errors when elements and sources exist', () => {
      const store = createTestStore({
        projects: {
          items: [{ id: 1, name: 'Test Project', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
          currentProject: { id: 1, name: 'Test Project', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          loading: false,
          error: null,
        },
        design: {
          elements: [
            {
              id: '1',
              type: 'dipole',
              name: 'Dipole 1',
              x: 0,
              y: 0,
              z: 0,
              length: 0.5,
              radius: 0.001,
              frequency: 300e6,
              visible: true,
              locked: false,
              meshGenerated: true,
              mesh: { nodes: [[0, 0, 0], [1, 0, 0]], edges: [[0, 1]], metadata: {} },
            },
          ],
          mesh: null,
          selectedElementId: '1',
          sources: [{ elementId: '1', segmentIndex: 0, voltage: 1.0, frequency: 300e6 }],
          lumpedElements: [],
          antennaType: 'single',
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
          frequencySweep: null,
          sweepInProgress: false,
          resultsHistory: [],
          requestedFields: [],
          directivityRequested: false,
          directivitySettings: { theta_points: 19, phi_points: 37 },
          solverState: 'idle',
          currentFrequency: null,
          fieldResults: null,
          postprocessingStatus: 'idle',
          postprocessingProgress: null,
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
            <DesignPage />
          </BrowserRouter>
        </Provider>
      );

      // Just check that it renders successfully with elements
      expect(screen.getByRole('tab', { name: /Postprocessing/i })).toBeInTheDocument();
    });
  });
});
