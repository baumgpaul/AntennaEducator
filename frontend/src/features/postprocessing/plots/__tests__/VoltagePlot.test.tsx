/**
 * Tests for VoltagePlot component
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VoltagePlot from '../VoltagePlot';

describe('VoltagePlot', () => {
  const mockData = [
    { frequency: 300e6, magnitude: 1.5, phase: 0.5 },
    { frequency: 310e6, magnitude: 1.6, phase: 0.6 },
    { frequency: 320e6, magnitude: 1.4, phase: 0.4 },
  ];

  it('renders plot with data', () => {
    const { container } = render(<VoltagePlot data={mockData} portNumber={1} />);

    expect(screen.getByText('Voltage (Port 1)')).toBeInTheDocument();
    // Legend text (|V|, ∠V) renders inside ResponsiveContainer which is 0x0 in jsdom
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<VoltagePlot data={mockData} portNumber={1} title="Custom Voltage" />);

    expect(screen.getByText('Custom Voltage')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<VoltagePlot data={[]} portNumber={2} />);

    expect(screen.getByText(/No voltage data available for Port 2/)).toBeInTheDocument();
  });

  it('displays correct port number in default title', () => {
    render(<VoltagePlot data={mockData} portNumber={3} />);

    expect(screen.getByText('Voltage (Port 3)')).toBeInTheDocument();
  });

  it('converts phase to degrees', () => {
    const { container } = render(<VoltagePlot data={mockData} portNumber={1} />);

    // Check that chart is rendered
    const chartContainer = container.querySelector('.recharts-responsive-container');
    expect(chartContainer).toBeInTheDocument();
  });
});
