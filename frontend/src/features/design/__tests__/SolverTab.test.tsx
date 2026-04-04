import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SolverTab } from '../SolverTab';
import type { AntennaElement } from '@/types/models';

const mockDispatch = vi.fn();
let mockState: any;

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector(mockState),
  useStore: () => ({ getState: () => mockState, dispatch: mockDispatch }),
}));

vi.mock('../TreeViewPanel', () => ({
  default: (props: any) => <div data-testid="tree-view-panel" {...props} />,
}));

vi.mock('../Scene3D', () => ({
  default: ({ children }: any) => <div data-testid="scene-3d">{children}</div>,
}));

vi.mock('../WireGeometry', () => ({
  default: () => <div data-testid="wire-geometry" />,
}));

vi.mock('../FieldRegionVisualization', () => ({
  FieldRegionVisualization: () => <div data-testid="field-region-visualization" />,
}));

vi.mock('../SolverPropertiesPanel', () => ({
  SolverPropertiesPanel: () => <div data-testid="solver-properties-panel" />,
}));

vi.mock('../FrequencyInputDialog', () => ({
  FrequencyInputDialog: ({ open }: any) => (open ? <div data-testid="frequency-dialog" /> : null),
}));

vi.mock('../AddFieldDialog', () => ({
  AddFieldDialog: ({ open, onCreate }: any) =>
    open ? (
      <button
        type="button"
        data-testid="add-field-dialog"
        onClick={() =>
          onCreate({
            id: 'field-1',
            type: '2D',
            shape: 'plane',
            centerPoint: [0, 0, 0],
            dimensions: { width: 1, height: 1 },
            sampling: { x: 1, y: 1 },
            fieldType: 'E',
          })
        }
      >
        create
      </button>
    ) : null,
}));

vi.mock('../ParameterStudyDialog', () => ({
  ParameterStudyDialog: () => null,
}));

describe('SolverTab', () => {
  const mockElements: AntennaElement[] = [
    {
      id: '1',
      name: 'Dipole 1',
      type: 'dipole',
      visible: true,
      locked: false,
      color: '#ff0000',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      parameters: {
        length: 150,
        radius: 2,
      },
    },
  ];

  beforeEach(() => {
    mockDispatch.mockClear();
    mockState = {
      solver: {
        requestedFields: [],
        directivityRequested: false,
        directivitySettings: { theta_points: 19, phi_points: 37 },
        solverState: 'idle',
        status: 'idle',
        progress: 0,
        error: null,
        results: null,
        currentDistribution: null,
        frequencySweep: null,
        sweepInProgress: false,
        sweepProgress: 0,
        currentFrequency: null,
        fieldResults: null,
        postprocessingStatus: 'idle',
        postprocessingProgress: null,
        resultsStale: false,
        parameterStudy: null,
        parameterStudyConfig: null,
        portResults: null,
      },
      design: {
        isSolved: false,
      },
      variables: {
        variables: [
          { name: 'freq', expression: '300e6', unit: 'Hz', description: '' },
          { name: 'wavelength', expression: 'C_0 / freq', unit: 'm', description: '' },
        ],
      },
    };
  });

  it('renders solver panels and controls', () => {
    render(
      <SolverTab
        elements={mockElements}
        selectedElementId={null}
        onElementSelect={() => {}}
        onElementVisibilityToggle={() => {}}
      />
    );

    expect(screen.getByTestId('tree-view-panel')).toBeInTheDocument();
    expect(screen.getByTestId('scene-3d')).toBeInTheDocument();
    expect(screen.getByText('Solve Single')).toBeInTheDocument();
    expect(screen.getByText('Add Directivity')).toBeInTheDocument();
  });

  it('disables postprocessing until solver is solved', () => {
    const { rerender } = render(
      <SolverTab
        elements={mockElements}
        selectedElementId={null}
        onElementSelect={() => {}}
        onElementVisibilityToggle={() => {}}
      />
    );

    expect(screen.getByText('Compute Fields')).toBeDisabled();

    mockState.solver.solverState = 'solved';
    mockState.design.isSolved = true;

    rerender(
      <SolverTab
        elements={mockElements}
        selectedElementId={null}
        onElementSelect={() => {}}
        onElementVisibilityToggle={() => {}}
      />
    );

    expect(screen.getByText('Compute Fields')).not.toBeDisabled();
  });

  it('dispatches directivity request when clicking Add Directivity', () => {
    render(
      <SolverTab
        elements={mockElements}
        selectedElementId={null}
        onElementSelect={() => {}}
        onElementVisibilityToggle={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Add Directivity'));

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'solver/setDirectivityRequested', payload: true })
    );
  });
});
