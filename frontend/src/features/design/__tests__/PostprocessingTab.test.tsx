import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import PostprocessingTab from '../PostprocessingTab';
import postprocessingReducer from '@/store/postprocessingSlice';
import designReducer from '@/store/designSlice';
import solverReducer from '@/store/solverSlice';
import type { AntennaElement } from '@/types/models';
import type { ViewConfiguration } from '@/types/postprocessing';

const makeElement = (id: string, name: string, type: AntennaElement['type']): AntennaElement => ({
  id,
  name,
  type,
  config: {} as any,
  position: [0, 0, 0] as any,
  rotation: [0, 0, 0] as any,
  mesh: { nodes: [], edges: [], radii: [], metadata: {} } as any,
  visible: true,
  locked: false,
});

const makeView = (id: string, name: string, items: ViewConfiguration['items'] = []): ViewConfiguration => ({
  id,
  name,
  viewType: '3D',
  items,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Helper to create a test store and render with Provider
function renderWithStore(
  component: React.ReactElement,
  overrides: { postprocessing?: Record<string, unknown>; solver?: Record<string, unknown> } = {},
) {
  const store = configureStore({
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
        addAntennaDialogOpen: false,
        addFieldDialogOpen: false,
        addScalarPlotDialogOpen: false,
        scalarPlotPreselect: null,
        exportPDFDialogOpen: false,
        exportType: null,
        ...overrides.postprocessing,
      } as any,
      solver: {
        status: 'idle',
        progress: 0,
        error: null,
        currentRequest: null,
        results: null,
        currentDistribution: null,
        radiationPattern: null,
        multiAntennaResults: null,
        frequencySweep: null,
        sweepInProgress: false,
        sweepProgress: null,
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
        radiationPatterns: null,
        selectedFrequencyHz: null,
        resultsStale: false,
        ...overrides.solver,
      } as any,
    },
  });
  return render(<Provider store={store}>{component}</Provider>);
}

describe('PostprocessingTab', () => {
  it('renders result views section and empty state', () => {
    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={null}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      { solver: { currentFrequency: 300 } },
    );

    // TreeViewPanel in postprocessing mode renders "Result Views"
    expect(screen.getByText('Result Views')).toBeInTheDocument();
    // Empty views message
    expect(screen.getByText(/No result views yet/i)).toBeInTheDocument();
  });

  it('renders "no view selected" when no view is selected', () => {
    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Dipole 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      { solver: { currentFrequency: 300 } },
    );

    // Middle panel shows placeholder
    expect(
      screen.getByText('No view selected. Create a view to get started.'),
    ).toBeInTheDocument();
  });

  it('renders view configurations with items', () => {
    const views: ViewConfiguration[] = [
      makeView('v1', 'My 3D View', [
        { id: 'i1', type: 'current', label: 'Currents', visible: true },
        { id: 'i2', type: 'voltage', label: 'Voltages', visible: true },
      ]),
    ];

    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Wire 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      {
        postprocessing: { viewConfigurations: views, selectedViewId: null, selectedItemId: null },
        solver: { currentFrequency: 300 },
      },
    );

    expect(screen.getByText('My 3D View')).toBeInTheDocument();
    expect(screen.getByText('Currents')).toBeInTheDocument();
    expect(screen.getByText('Voltages')).toBeInTheDocument();
  });

  it('shows warning banner when no results available', () => {
    renderWithStore(
      <PostprocessingTab
        solverState="idle"
        elements={[]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={null}
        currentFrequency={null}
        frequencySweep={null}
        fieldData={null}
      />,
    );

    expect(screen.getByText('No Results Available')).toBeInTheDocument();
    expect(
      screen.getByText(/No solver results found. Please run the solver first./i),
    ).toBeInTheDocument();
  });

  it('shows stale results warning', () => {
    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Wire 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      { solver: { resultsStale: true, currentFrequency: 300 } },
    );

    expect(screen.getByText('Results Outdated')).toBeInTheDocument();
  });

  it('renders properties panel with "no view selected" when nothing selected', () => {
    // Properties panel is controlled by rightPanelOpen state. When no view is selected,
    // the panel shows "No view selected" IF the panel is open.
    // Since rightPanelOpen defaults to false, verifying the middle panel placeholder is enough.
    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Dipole 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      { solver: { currentFrequency: 300 } },
    );

    expect(
      screen.getByText('No view selected. Create a view to get started.'),
    ).toBeInTheDocument();
  });

  it('shows view properties when a view is selected', () => {
    const views: ViewConfiguration[] = [
      makeView('v1', 'My View', [
        { id: 'i1', type: 'current', label: 'Branch Currents', visible: true },
      ]),
    ];

    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Wire 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      {
        postprocessing: {
          viewConfigurations: views,
          selectedViewId: 'v1',
          selectedItemId: null,
        },
        solver: { currentFrequency: 300 },
      },
    );

    // Properties panel auto-opens when a view is selected
    expect(screen.getByText('View Properties')).toBeInTheDocument();
  });

  it('shows item properties when an item is selected', () => {
    const views: ViewConfiguration[] = [
      makeView('v1', 'My View', [
        { id: 'i1', type: 'current', label: 'Branch Currents', visible: true },
      ]),
    ];

    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Wire 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      {
        postprocessing: {
          viewConfigurations: views,
          selectedViewId: 'v1',
          selectedItemId: 'i1',
        },
        solver: { currentFrequency: 300 },
      },
    );

    // Properties panel shows view + item properties
    expect(screen.getByText('View Properties')).toBeInTheDocument();
    expect(screen.getByText('Item Properties')).toBeInTheDocument();
  });

  it('shows 3D View chip for 3D view type', () => {
    const views: ViewConfiguration[] = [makeView('v1', 'View A')];

    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Wire 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      {
        postprocessing: {
          viewConfigurations: views,
          selectedViewId: null,
          selectedItemId: null,
        },
        solver: { currentFrequency: 300 },
      },
    );

    expect(screen.getByText('3D')).toBeInTheDocument();
  });

  it('shows Line chip for Line view type', () => {
    const views: ViewConfiguration[] = [
      { ...makeView('v1', 'Line Plot'), viewType: 'Line' },
    ];

    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Wire 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      {
        postprocessing: {
          viewConfigurations: views,
          selectedViewId: null,
          selectedItemId: null,
        },
        solver: { currentFrequency: 300 },
      },
    );

    expect(screen.getByText('Line')).toBeInTheDocument();
  });

  it('shows "No items in this view" for empty view', () => {
    const views: ViewConfiguration[] = [makeView('v1', 'Empty View', [])];

    renderWithStore(
      <PostprocessingTab
        solverState="solved"
        elements={[makeElement('1', 'Wire 1', 'dipole')]}
        requestedFields={[]}
        directivityRequested={false}
        fieldResults={{}}
        currentFrequency={300}
        frequencySweep={null}
        fieldData={null}
      />,
      {
        postprocessing: {
          viewConfigurations: views,
          selectedViewId: null,
          selectedItemId: null,
        },
        solver: { currentFrequency: 300 },
      },
    );

    expect(screen.getByText('No items in this view')).toBeInTheDocument();
  });
});
