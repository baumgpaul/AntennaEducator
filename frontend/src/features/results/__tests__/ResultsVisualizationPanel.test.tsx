import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import ResultsVisualizationPanel from '../ResultsVisualizationPanel';

// Mock React Three Fiber components
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="three-canvas">{children}</div>,
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  PerspectiveCamera: () => null,
}));

// Mock child components
vi.mock('../../design/WireGeometry', () => ({
  default: () => <mesh data-testid="wire-geometry" />,
}));

vi.mock('../../design/RadiationPatternPanel', () => ({
  default: () => <div data-testid="radiation-pattern-panel">Radiation Pattern</div>,
}));

// Test wrapper that handles viewMode state
function TestWrapper({ initialViewMode = '3d' as const, ...props }: any) {
  const [viewMode, setViewMode] = useState<'3d' | 'charts' | 'pattern'>(initialViewMode);
  return (
    <ResultsVisualizationPanel
      {...props}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
    />
  );
}

describe('ResultsVisualizationPanel', () => {
  const mockMesh = {
    nodes: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
    edges: [
      [0, 1],
      [1, 2],
    ],
    metadata: {},
  };

  const mockResults = {
    frequency: 300e6,
    impedance: { real: 50, imag: 0 },
    currents: [
      { segment_index: 0, magnitude: 1.0, phase: 0, real: 1.0, imag: 0 },
      { segment_index: 1, magnitude: 0.8, phase: 0.5, real: 0.7, imag: 0.4 },
    ],
  };

  const mockCurrentDistribution = [1.0, 0.8, 0.6];

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
    max_direction: [0, 0],
  };

  describe('View Mode Switching', () => {
    it('should render view mode toggle buttons', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      expect(screen.getByRole('button', { name: '3D View' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Charts' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pattern' })).toBeInTheDocument();
    });

    it('should start with 3D view selected', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      const button = screen.getByRole('button', { name: '3D View' });
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('should switch to Charts view when clicked', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      const chartsButton = screen.getByRole('button', { name: 'Charts' });
      fireEvent.click(chartsButton);

      expect(screen.getByText(/Coming Soon/i)).toBeInTheDocument();
      expect(screen.getByText(/Interactive charts/i)).toBeInTheDocument();
    });

    it('should switch to Pattern view when clicked', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={mockRadiationPattern}
          selectedFrequency={300e6}
        />
      );

      const patternButton = screen.getByRole('button', { name: 'Pattern' });
      fireEvent.click(patternButton);

      expect(screen.getByTestId('radiation-pattern-panel')).toBeInTheDocument();
    });
  });

  describe('3D View', () => {
    it('should render Three.js canvas in 3D view', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      expect(screen.getByTestId('three-canvas')).toBeInTheDocument();
      expect(screen.getByTestId('wire-geometry')).toBeInTheDocument();
    });

    it('should show field type and color map selectors in 3D view', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      // Check for FormControl elements that contain selectors
      const formControls = screen.getAllByRole('combobox');
      expect(formControls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Charts View', () => {
    it('should show charts content in Charts view', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      const chartsButton = screen.getByRole('button', { name: 'Charts' });
      fireEvent.click(chartsButton);

      expect(screen.getByText(/Interactive Charts/i)).toBeInTheDocument();
      expect(screen.getByText(/Current distribution charts coming soon/i)).toBeInTheDocument();
    });
  });

  describe('Pattern View', () => {
    it('should render radiation pattern when available', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={mockRadiationPattern}
          selectedFrequency={300e6}
        />
      );

      const patternButton = screen.getByRole('button', { name: 'Pattern' });
      fireEvent.click(patternButton);

      expect(screen.getByTestId('radiation-pattern-panel')).toBeInTheDocument();
    });

    it('should show message when pattern is null', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      const patternButton = screen.getByRole('button', { name: 'Pattern' });
      fireEvent.click(patternButton);

      expect(screen.getByText(/No radiation pattern data available/i)).toBeInTheDocument();
      expect(screen.getByText(/Run Postprocess/i)).toBeInTheDocument();
    });
  });

  describe('No Mesh State', () => {
    it('should display message when no mesh is available', () => {
      render(
        <TestWrapper
          mesh={null}
          results={mockResults}
          currentDistribution={mockCurrentDistribution}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      expect(screen.getByText(/No geometry available/i)).toBeInTheDocument();
    });
  });

  describe('No Current Distribution', () => {
    it('should handle null current distribution', () => {
      render(
        <TestWrapper
          mesh={mockMesh}
          results={mockResults}
          currentDistribution={null}
          radiationPattern={null}
          selectedFrequency={300e6}
        />
      );

      // Should still render without errors
      expect(screen.getByTestId('three-canvas')).toBeInTheDocument();
    });
  });
});
