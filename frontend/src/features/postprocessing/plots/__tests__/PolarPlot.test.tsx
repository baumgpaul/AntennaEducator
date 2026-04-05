/**
 * Unit tests for PolarPlot component.
 *
 * Tests pure SVG polar chart for radiation pattern visualization.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PolarPlot from '../PolarPlot';

describe('PolarPlot', () => {
  const sampleData = [
    { angleDeg: 0, value: 0 },
    { angleDeg: 30, value: -3 },
    { angleDeg: 60, value: -8 },
    { angleDeg: 90, value: -15 },
    { angleDeg: 120, value: -8 },
    { angleDeg: 150, value: -3 },
    { angleDeg: 180, value: 0 },
    { angleDeg: 210, value: -3 },
    { angleDeg: 240, value: -8 },
    { angleDeg: 270, value: -15 },
    { angleDeg: 300, value: -8 },
    { angleDeg: 330, value: -3 },
  ];

  it('renders SVG element', () => {
    const { container } = render(
      <PolarPlot data={sampleData} scale="dB" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders concentric grid circles', () => {
    const { container } = render(
      <PolarPlot data={sampleData} scale="dB" />,
    );
    const circles = container.querySelectorAll('circle.polar-grid-circle');
    expect(circles.length).toBeGreaterThanOrEqual(3);
  });

  it('renders radial grid lines', () => {
    const { container } = render(
      <PolarPlot data={sampleData} scale="dB" />,
    );
    const lines = container.querySelectorAll('line.polar-grid-line');
    // Should have lines at 0, 30, 60, ..., 330 = 12 lines
    expect(lines.length).toBe(12);
  });

  it('renders data path', () => {
    const { container } = render(
      <PolarPlot data={sampleData} scale="dB" />,
    );
    const path = container.querySelector('path.polar-data-path');
    expect(path).toBeInTheDocument();
    expect(path?.getAttribute('d')).toBeTruthy();
  });

  it('renders angle labels', () => {
    render(<PolarPlot data={sampleData} scale="dB" />);
    expect(screen.getByText('0°')).toBeInTheDocument();
    expect(screen.getByText('90°')).toBeInTheDocument();
    expect(screen.getByText('180°')).toBeInTheDocument();
    expect(screen.getByText('270°')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<PolarPlot data={sampleData} scale="dB" title="Directivity (dBi)" />);
    expect(screen.getByText('Directivity (dBi)')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<PolarPlot data={[]} scale="dB" />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('handles linear scale', () => {
    const linearData = sampleData.map((d) => ({ ...d, value: Math.abs(d.value) }));
    const { container } = render(
      <PolarPlot data={linearData} scale="linear" />,
    );
    const path = container.querySelector('path.polar-data-path');
    expect(path).toBeInTheDocument();
  });
});
