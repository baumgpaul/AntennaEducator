import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SolutionDataPanel from '../SolutionDataPanel';
import solverReducer from '@/store/solverSlice';

const createTestStore = (overrides: Record<string, any> = {}) =>
  configureStore({
    reducer: { solver: solverReducer },
    preloadedState: overrides.solver ? { solver: { ...defaultSolverState, ...overrides.solver } } : undefined,
  });

const defaultSolverState = {
  status: 'idle' as const,
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
  solverState: 'idle' as const,
  currentFrequency: null,
  fieldResults: null,
  postprocessingStatus: 'idle' as const,
  postprocessingProgress: null,
  fieldData: null,
  radiationPatterns: null,
  selectedFrequencyHz: null,
  resultsStale: false,
};

const renderWithStore = (ui: React.ReactElement, solverOverrides: Record<string, any> = {}) => {
  const store = createTestStore({ solver: solverOverrides });
  return render(<Provider store={store}>{ui}</Provider>);
};

describe('SolutionDataPanel', () => {
  const mockMesh = {
    nodes: [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
    edges: [[0, 1], [1, 2]],
    metadata: {},
  };

  const mockResults = {
    frequency: 300e6,
    impedance: { real: 50, imag: 10 },
    currents: [
      { segment_index: 0, magnitude: 1.0, phase: 0, real: 1.0, imag: 0 },
      { segment_index: 1, magnitude: 0.8, phase: 0.5, real: 0.7, imag: 0.4 },
      { segment_index: 2, magnitude: 0.6, phase: 1.0, real: 0.3, imag: 0.5 },
    ],
  };

  const mockCurrentDistribution = [1.0, 0.8, 0.6];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockRadiationPattern = {
    frequency: 300e6,
    theta_angles: [0, 30, 60, 90],
    phi_angles: [0, 90, 180, 270],
    E_theta_mag: [],
    E_phi_mag: [],
    E_total_mag: [],
    pattern_db: [],
    directivity: 2.15,
    gain: 2.15,
    efficiency: 1.0,
    max_direction: [0, 0] as [number, number],
  };

  describe('Current Distribution Display', () => {
    it('should render current distribution accordion', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={null}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />
      );

      expect(screen.getByText('Currents')).toBeInTheDocument();
    });

    it('should display current statistics', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={null}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />
      );

      // Statistics are visible since Currents accordion is defaultExpanded
      expect(screen.getByText('Max')).toBeInTheDocument();
      expect(screen.getByText(/1\.00e\+0 A/i)).toBeInTheDocument();
      expect(screen.getByText('Avg')).toBeInTheDocument();
    });

    it('should render current table with all segments', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={mockMesh}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />
      );

      // Verify segments count is shown
      expect(screen.getByText(/Segments: 3/i)).toBeInTheDocument();
    });
  });

  describe('Voltage Display', () => {
    it('should render voltages accordion', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={mockMesh}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />
      );

      expect(screen.getByText('Voltages')).toBeInTheDocument();
    });
  });

  describe('Field Options', () => {
    it('should render requested fields accordion', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={mockMesh}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />
      );

      expect(screen.getByText('Requested Fields')).toBeInTheDocument();
    });

    it('should render all field checkboxes', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={mockMesh}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />
      );

      // Expand accordion
      const accordion = screen.getByText('Requested Fields').closest('div[role="button"]');
      if (accordion) fireEvent.click(accordion);

      expect(screen.getByLabelText('Directivity')).toBeInTheDocument();
      expect(screen.getByLabelText('Poynting (S)')).toBeInTheDocument();
      expect(screen.getByLabelText('E-field')).toBeInTheDocument();
      expect(screen.getByLabelText('H-field')).toBeInTheDocument();
    });

    it('should have enabled "Run Postprocess" button when directivity is pre-selected', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={mockMesh}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />,
        { solverState: 'solved' }
      );

      // Expand accordion
      const accordion = screen.getByText('Requested Fields').closest('div[role="button"]');
      if (accordion) fireEvent.click(accordion);

      const button = screen.getByRole('button', { name: /Run Postprocess/i });
      // Directivity is checked by default, so button should be enabled
      expect(button).not.toBeDisabled();
    });

    it('should disable "Run Postprocess" button when no fields selected', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={mockMesh}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />,
        { solverState: 'solved' }
      );

      // Expand accordion
      const accordion = screen.getByText('Requested Fields').closest('div[role="button"]');
      if (accordion) fireEvent.click(accordion);

      // Uncheck directivity
      const checkbox = screen.getByLabelText('Directivity');
      fireEvent.click(checkbox);

      const button = screen.getByRole('button', { name: /Run Postprocess/i });
      expect(button).toBeDisabled();
    });
  });

  describe('Frequency Display', () => {
    it('should show frequency value', () => {
      renderWithStore(
        <SolutionDataPanel
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          mesh={mockMesh}
          selectedFrequency={300e6}
          onFrequencyChange={vi.fn()}
        />
      );

      expect(screen.getByText('Frequency')).toBeInTheDocument();
      expect(screen.getByText('300 MHz')).toBeInTheDocument();
    });

    it('should show default frequency when no results', () => {
      renderWithStore(
        <SolutionDataPanel
          results={null}
          currentDistribution={null}
          radiationPattern={null}
          mesh={null}
          selectedFrequency={100e6}
          onFrequencyChange={vi.fn()}
        />
      );

      expect(screen.getByText('100 MHz')).toBeInTheDocument();
    });
  });
});
