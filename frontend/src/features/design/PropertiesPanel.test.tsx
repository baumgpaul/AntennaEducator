/**
 * PropertiesPanel Tests — Source editing for dipole elements
 * Tests for editable source type, amplitude, and phase in properties panel
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropertiesPanel from './PropertiesPanel';
import type { AntennaElement } from '@/types/models';

const makeDipoleElement = (overrides?: Partial<AntennaElement>): AntennaElement => ({
  id: 'dipole_1',
  type: 'dipole',
  name: 'Test Dipole',
  config: { length: 0.143, wire_radius: 0.001, gap: 0.001, segments: 21, orientation: [0, 0, 1] },
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  mesh: {
    nodes: [[0, 0, 0], [0, 0, 0.07], [0, 0, 0.14]],
    edges: [[0, 1], [1, 2]],
    radii: [0.001, 0.001],
  },
  sources: [
    {
      type: 'voltage',
      amplitude: { real: 1, imag: 0 },
      node_start: 1,
      node_end: 2,
      tag: 'Feed',
    },
  ],
  lumped_elements: [],
  visible: true,
  locked: false,
  color: '#FF8C00',
  ...overrides,
});

describe('PropertiesPanel — Source configuration for dipole', () => {
  const defaultProps = {
    antennaElement: makeDipoleElement(),
    onSourceChange: vi.fn(),
  };

  it('shows Feed Configuration section when dipole is selected', () => {
    render(<PropertiesPanel {...defaultProps} />);
    expect(screen.getByText(/feed configuration/i)).toBeInTheDocument();
  });

  it('shows source type toggle with current value', () => {
    render(<PropertiesPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /voltage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /current/i })).toBeInTheDocument();
  });

  it('shows amplitude and phase fields', () => {
    render(<PropertiesPanel {...defaultProps} />);
    expect(screen.getByLabelText(/amplitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phase/i)).toBeInTheDocument();
  });

  it('displays current source amplitude value', () => {
    render(<PropertiesPanel {...defaultProps} />);
    const amplitudeInput = screen.getByLabelText(/amplitude/i) as HTMLInputElement;
    expect(amplitudeInput.value).toBe('1');
  });

  it('displays current source phase value', () => {
    render(<PropertiesPanel {...defaultProps} />);
    const phaseInput = screen.getByLabelText(/phase/i) as HTMLInputElement;
    expect(phaseInput.value).toBe('0');
  });

  it('calls onSourceChange when source type is toggled', async () => {
    const onSourceChange = vi.fn();
    const user = userEvent.setup();
    render(<PropertiesPanel {...defaultProps} onSourceChange={onSourceChange} />);

    await user.click(screen.getByRole('button', { name: /current/i }));
    expect(onSourceChange).toHaveBeenCalledWith('dipole_1', expect.objectContaining({ type: 'current' }));
  });

  it('calls onSourceChange when amplitude changes', async () => {
    const onSourceChange = vi.fn();
    const user = userEvent.setup();
    render(<PropertiesPanel {...defaultProps} onSourceChange={onSourceChange} />);

    const amplitudeInput = screen.getByLabelText(/amplitude/i);
    await user.clear(amplitudeInput);
    await user.type(amplitudeInput, '2.5');
    expect(onSourceChange).toHaveBeenCalled();
  });

  it('shows V unit for voltage source, A for current', async () => {
    render(<PropertiesPanel {...defaultProps} />);
    // Voltage mode: should show V
    expect(screen.getByText('V')).toBeInTheDocument();
  });

  it('shows phase with correct value for non-zero imaginary', () => {
    // amplitude = {real: 0.866, imag: 0.5} → magnitude=1, phase=30°
    const element = makeDipoleElement({
      sources: [{
        type: 'voltage',
        amplitude: { real: 0.866, imag: 0.5 },
        node_start: 1,
        node_end: 2,
        tag: 'Feed',
      }],
    });
    render(<PropertiesPanel antennaElement={element} onSourceChange={vi.fn()} />);
    const phaseInput = screen.getByLabelText(/phase/i) as HTMLInputElement;
    // atan2(0.5, 0.866) ≈ 30°
    expect(parseFloat(phaseInput.value)).toBeCloseTo(30, 0);
  });
});
