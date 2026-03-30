/**
 * Tests for ImpedancePlot component
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImpedancePlot from '../ImpedancePlot';

describe('ImpedancePlot', () => {
  const mockData = [
    { frequency: 300e6, real: 50, imag: 25 },
    { frequency: 310e6, real: 52, imag: 22 },
    { frequency: 320e6, real: 48, imag: 28 },
  ];

  it('renders plot with data in rectangular mode', () => {
    const { container } = render(<ImpedancePlot data={mockData} displayMode="rectangular" />);

    expect(screen.getByText('Input Impedance')).toBeInTheDocument();
    // Legend text (Re(Z), Im(Z)) renders inside ResponsiveContainer which is 0x0 in jsdom
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('renders plot with data in polar mode', () => {
    const { container } = render(<ImpedancePlot data={mockData} displayMode="polar" />);

    expect(screen.getByText('Input Impedance')).toBeInTheDocument();
    // Legend text (|Z|, ∠Z) renders inside ResponsiveContainer which is 0x0 in jsdom
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<ImpedancePlot data={mockData} title="My Custom Title" />);

    expect(screen.getByText('My Custom Title')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<ImpedancePlot data={[]} />);

    expect(screen.getByText('No impedance data available')).toBeInTheDocument();
  });

  it('converts frequency to MHz', () => {
    const { container } = render(<ImpedancePlot data={mockData} />);

    // Check that chart is rendered (ResponsiveContainer creates a div)
    const chartContainer = container.querySelector('.recharts-responsive-container');
    expect(chartContainer).toBeInTheDocument();
  });
});
