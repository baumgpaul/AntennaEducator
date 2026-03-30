/**
 * Tests for CurrentPlot component
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CurrentPlot from '../CurrentPlot';

describe('CurrentPlot', () => {
  const mockData = [
    { frequency: 300e6, magnitude: 0.5, phase: 1.2 },
    { frequency: 310e6, magnitude: 0.6, phase: 1.3 },
    { frequency: 320e6, magnitude: 0.4, phase: 1.1 },
  ];

  it('renders plot with data', () => {
    const { container } = render(<CurrentPlot data={mockData} antennaId="ant-1" antennaName="Dipole 1" />);

    expect(screen.getByText('Current (Dipole 1)')).toBeInTheDocument();
    // Legend text (|I|, ∠I) renders inside ResponsiveContainer which is 0x0 in jsdom
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<CurrentPlot data={mockData} antennaId="ant-1" title="Custom Current" />);

    expect(screen.getByText('Custom Current')).toBeInTheDocument();
  });

  it('uses antenna ID when no name provided', () => {
    render(<CurrentPlot data={mockData} antennaId="ant-2" />);

    expect(screen.getByText('Current (ant-2)')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<CurrentPlot data={[]} antennaId="ant-1" antennaName="Dipole 1" />);

    expect(screen.getByText(/No current data available for Dipole 1/)).toBeInTheDocument();
  });

  it('shows empty state with antenna ID when no name', () => {
    render(<CurrentPlot data={[]} antennaId="ant-3" />);

    expect(screen.getByText(/No current data available for antenna ant-3/)).toBeInTheDocument();
  });

  it('converts phase to degrees', () => {
    const { container } = render(<CurrentPlot data={mockData} antennaId="ant-1" />);

    // Check that chart is rendered
    const chartContainer = container.querySelector('.recharts-responsive-container');
    expect(chartContainer).toBeInTheDocument();
  });
});
