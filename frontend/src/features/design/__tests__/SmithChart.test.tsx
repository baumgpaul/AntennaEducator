/**
 * Tests for SmithChart component — plots impedance data on a Smith chart
 * using SVG. Each point is plotted as the normalized reflection coefficient
 * Γ = (Z - Z₀) / (Z + Z₀) on the unit circle.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SmithChart, impedanceToGamma } from '../../postprocessing/plots/SmithChart';
import type { SmithChartPoint } from '../../postprocessing/plots/SmithChart';

// ============================================================================
// Pure function tests
// ============================================================================

describe('impedanceToGamma', () => {
  it('returns origin for Z = Z0 (perfect match)', () => {
    const { x, y } = impedanceToGamma(50, 0, 50);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it('returns (1, 0) for open circuit (Z → ∞)', () => {
    const { x, y } = impedanceToGamma(1e12, 0, 50);
    expect(x).toBeCloseTo(1, 2);
    expect(y).toBeCloseTo(0, 2);
  });

  it('returns (-1, 0) for short circuit (Z = 0)', () => {
    const { x, y } = impedanceToGamma(0, 0, 50);
    expect(x).toBeCloseTo(-1, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it('returns positive imaginary for inductive load', () => {
    // Z = 50 + 50j → Γ = j50 / (100 + 50j)
    const { y } = impedanceToGamma(50, 50, 50);
    expect(y).toBeGreaterThan(0);
  });

  it('returns negative imaginary for capacitive load', () => {
    // Z = 50 - 50j → Γ = -j50 / (100 - 50j)
    const { y } = impedanceToGamma(50, -50, 50);
    expect(y).toBeLessThan(0);
  });

  it('produces |Γ| ≤ 1 for passive loads', () => {
    const { x, y } = impedanceToGamma(100, 200, 50);
    expect(Math.sqrt(x * x + y * y)).toBeLessThanOrEqual(1.001);
  });
});

// ============================================================================
// Component tests
// ============================================================================

describe('SmithChart', () => {
  const sampleData: SmithChartPoint[] = [
    { zReal: 50, zImag: 0, label: '300 MHz' },
    { zReal: 73, zImag: 42, label: '350 MHz' },
    { zReal: 30, zImag: -20, label: '250 MHz' },
  ];

  it('renders an SVG element', () => {
    const { container } = render(<SmithChart data={sampleData} z0={50} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the unit circle', () => {
    const { container } = render(<SmithChart data={sampleData} z0={50} />);
    // The outer boundary circle
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThan(0);
  });

  it('renders data points as circle elements', () => {
    const { container } = render(<SmithChart data={sampleData} z0={50} />);
    // Data points have a specific class or data attribute
    const dataPoints = container.querySelectorAll('[data-testid="smith-point"]');
    expect(dataPoints.length).toBe(3);
  });

  it('renders with custom size', () => {
    const { container } = render(<SmithChart data={sampleData} z0={50} size={500} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('500');
  });

  it('renders title', () => {
    render(<SmithChart data={sampleData} z0={50} title="Smith Chart" />);
    expect(screen.getByText('Smith Chart')).toBeInTheDocument();
  });

  it('renders without crashing when data is empty', () => {
    const { container } = render(<SmithChart data={[]} z0={50} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows Z₀ label', () => {
    render(<SmithChart data={sampleData} z0={50} />);
    expect(screen.getByText(/Z₀\s*=\s*50/)).toBeInTheDocument();
  });
});
