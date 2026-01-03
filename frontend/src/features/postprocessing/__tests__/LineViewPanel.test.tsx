/**
 * Tests for LineViewPanel component
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import LineViewPanel from '../LineViewPanel';
import postprocessingReducer from '@/store/postprocessingSlice';
import designReducer from '@/store/designSlice';
import solverReducer from '@/store/solverSlice';
import type { ViewConfiguration } from '@/types/postprocessing';

describe('LineViewPanel', () => {
  const createTestStore = (preloadedState = {}) => {
    return configureStore({
      reducer: {
        postprocessing: postprocessingReducer,
        design: designReducer,
        solver: solverReducer,
      },
      preloadedState: {
        postprocessing: {
          viewConfigurations: [],
          selectedViewId: null,
          selectedItemId: null,
          addViewDialogOpen: false,
          addAntennaElementDialogOpen: false,
          addFieldVisualizationDialogOpen: false,
          addScalarPlotDialogOpen: false,
        },
        design: {
          elements: [],
          sources: [],
          loadPorts: [],
          selectedElementId: null,
          currentTab: 'designer',
          requestedFields: [],
          fieldRegions: [],
          selectedFieldId: null,
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
          fieldData: null,
        },
        ...preloadedState,
      },
    });
  };

  const renderWithStore = (component: React.ReactElement, preloadedState = {}) => {
    const store = createTestStore(preloadedState);
    return render(<Provider store={store}>{component}</Provider>);
  };

  it('shows empty state when no items in view', () => {
    const emptyView: ViewConfiguration = {
      id: 'view-1',
      name: 'Test View',
      viewType: 'Line',
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    renderWithStore(<LineViewPanel view={emptyView} />);
    
    expect(screen.getByText(/No plots added to this view/)).toBeInTheDocument();
  });

  it('renders impedance plot with sweep data', () => {
    const view: ViewConfiguration = {
      id: 'view-1',
      name: 'Test View',
      viewType: 'Line',
      items: [
        {
          id: 'item-1',
          type: 'impedance-plot',
          label: 'Input Impedance',
          visible: true,
          displayMode: 'rectangular',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const storeState = {
      solver: {
        frequencySweep: {
          frequencies: [300e6, 310e6, 320e6],
          impedances: [
            { real: 50, imag: 25 },
            { real: 52, imag: 22 },
            { real: 48, imag: 28 },
          ],
        },
      },
    };

    renderWithStore(<LineViewPanel view={view} />, storeState);
    
    expect(screen.getByText('Input Impedance')).toBeInTheDocument();
  });

  it('renders voltage plot with sweep data', () => {
    const view: ViewConfiguration = {
      id: 'view-1',
      name: 'Test View',
      viewType: 'Line',
      items: [
        {
          id: 'item-1',
          type: 'voltage-plot',
          label: 'Port Voltage',
          visible: true,
          portNumber: 1,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const storeState = {
      solver: {
        frequencySweep: {
          frequencies: [300e6, 310e6, 320e6],
          voltages: {
            1: [
              { real: 1.5, imag: 0 },
              { real: 1.6, imag: 0 },
              { real: 1.4, imag: 0 },
            ],
          },
        },
      },
    };

    renderWithStore(<LineViewPanel view={view} />, storeState);
    
    expect(screen.getByText('Port Voltage')).toBeInTheDocument();
  });

  it('renders current plot with sweep data', () => {
    const view: ViewConfiguration = {
      id: 'view-1',
      name: 'Test View',
      viewType: 'Line',
      items: [
        {
          id: 'item-1',
          type: 'current-plot',
          label: 'Antenna Current',
          visible: true,
          antennaId: 'ant-1',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const storeState = {
      design: {
        elements: [{ id: 'ant-1', name: 'Dipole 1', type: 'dipole' }],
      },
      solver: {
        frequencySweep: {
          frequencies: [300e6, 310e6, 320e6],
          currents: {
            'ant-1': [
              { real: 0.5, imag: 0 },
              { real: 0.6, imag: 0 },
              { real: 0.4, imag: 0 },
            ],
          },
        },
      },
    };

    renderWithStore(<LineViewPanel view={view} />, storeState);
    
    expect(screen.getByText('Antenna Current')).toBeInTheDocument();
  });

  it('only renders visible items', () => {
    const view: ViewConfiguration = {
      id: 'view-1',
      name: 'Test View',
      viewType: 'Line',
      items: [
        {
          id: 'item-1',
          type: 'impedance-plot',
          label: 'Visible Plot',
          visible: true,
          displayMode: 'rectangular',
        },
        {
          id: 'item-2',
          type: 'impedance-plot',
          label: 'Hidden Plot',
          visible: false,
          displayMode: 'rectangular',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const storeState = {
      solver: {
        frequencySweep: {
          frequencies: [300e6],
          impedances: [{ real: 50, imag: 25 }],
        },
      },
    };

    renderWithStore(<LineViewPanel view={view} />, storeState);
    
    expect(screen.getByText('Visible Plot')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Plot')).not.toBeInTheDocument();
  });

  it('shows empty state for missing data', () => {
    const view: ViewConfiguration = {
      id: 'view-1',
      name: 'Test View',
      viewType: 'Line',
      items: [
        {
          id: 'item-1',
          type: 'impedance-plot',
          label: 'Input Impedance',
          visible: true,
          displayMode: 'rectangular',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // No frequency sweep data in solver state
    renderWithStore(<LineViewPanel view={view} />);
    
    expect(screen.getByText(/No impedance data available/)).toBeInTheDocument();
  });
});
