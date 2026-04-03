/**
 * Tests for ParameterStudyPlot — displays port quantities from parameter study
 * results as Recharts line charts.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParameterStudyPlot } from '../../postprocessing/plots/ParameterStudyPlot';
import type {
  ParameterStudyResult,
  ParameterPointResult,
  GridPoint,
  ParameterStudyConfig,
} from '@/types/parameterStudy';

// ============================================================================
// Helpers
// ============================================================================

function mockSolverResponse(real: number, imag: number) {
  return {
    frequency: 300e6,
    converged: true,
    antenna_solutions: [
      {
        antenna_id: 'ant-1',
        branch_currents: [],
        voltage_source_currents: [],
        load_currents: [],
        node_voltages: [],
        appended_voltages: [],
        input_impedance: { real, imag },
      },
    ],
    n_total_nodes: 10,
    n_total_edges: 9,
    solve_time: 0.01,
  };
}

function make1DStudy(): ParameterStudyResult {
  const config: ParameterStudyConfig = {
    sweepVariables: [
      { variableName: 'freq', min: 100e6, max: 300e6, numPoints: 3, spacing: 'linear' },
    ],
    referenceImpedance: 50,
  };
  const values = [100e6, 200e6, 300e6];
  const impedances = [
    { real: 73, imag: 42 },
    { real: 50, imag: 0 },
    { real: 30, imag: -20 },
  ];
  const gridPoints: GridPoint[] = values.map((v, i) => ({
    values: { freq: v },
    indices: [i],
  }));
  const results: ParameterPointResult[] = impedances.map((z, i) => ({
    point: gridPoints[i],
    solverResponse: mockSolverResponse(z.real, z.imag),
    converged: true,
  }));
  return { config, gridPoints, results, totalTimeMs: 150 };
}

// ============================================================================
// Recharts mock — intercept ResponsiveContainer (zero-size in jsdom)
// ============================================================================

// Recharts ResponsiveContainer renders nothing at 0x0 in jsdom.
// We mock it at the module level so charts render their children.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 600, height: 350 }}>
        {children}
      </div>
    ),
  };
});

// ============================================================================
// Tests
// ============================================================================

describe('ParameterStudyPlot', () => {
  it('renders without crashing', () => {
    const study = make1DStudy();
    render(<ParameterStudyPlot study={study} />);
    // Should render the component title
    expect(screen.getByText(/Parameter Study/i)).toBeInTheDocument();
  });

  it('shows sweep variable name in the title', () => {
    const study = make1DStudy();
    render(<ParameterStudyPlot study={study} />);
    expect(screen.getByText(/freq/i)).toBeInTheDocument();
  });

  it('shows quantity selector tabs', () => {
    const study = make1DStudy();
    render(<ParameterStudyPlot study={study} />);
    // Should have tabs for different quantities
    expect(screen.getByRole('tab', { name: /Impedance/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /VSWR/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Return Loss/i })).toBeInTheDocument();
  });

  it('shows summary info (total time, point count)', () => {
    const study = make1DStudy();
    render(<ParameterStudyPlot study={study} />);
    expect(screen.getByText(/3 points/i)).toBeInTheDocument();
  });

  it('defaults to Impedance tab', () => {
    const study = make1DStudy();
    render(<ParameterStudyPlot study={study} />);
    const tab = screen.getByRole('tab', { name: /Impedance/i });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to VSWR tab on click', async () => {
    const user = userEvent.setup();
    const study = make1DStudy();
    render(<ParameterStudyPlot study={study} />);
    const vswrTab = screen.getByRole('tab', { name: /VSWR/i });
    await user.click(vswrTab);
    expect(vswrTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders a chart container', () => {
    const study = make1DStudy();
    render(<ParameterStudyPlot study={study} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('shows empty state when study has no results', () => {
    const study = make1DStudy();
    study.results = [];
    render(<ParameterStudyPlot study={study} />);
    expect(screen.getByText(/No results/i)).toBeInTheDocument();
  });
});
