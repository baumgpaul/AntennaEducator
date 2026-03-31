/**
 * LoopDialog Tests — Expression Fields
 * Tests for expression-capable fields, resolution, segments rounding,
 * source type toggle, and expressions dict in submission data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { LoopDialog } from '../LoopDialog';

const C_0 = 299792458;

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

describe('LoopDialog — Expression Fields', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onGenerate: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onGenerate = vi.fn().mockResolvedValue(undefined);
  });

  describe('Default values', () => {
    it('radius defaults to "wavelength / (2 * pi)"', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Loop Radius/i) as HTMLInputElement;
      expect(input.value).toBe('wavelength / (2 * pi)');
    });

    it('wireRadius defaults to "0.001"', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Wire Radius/i) as HTMLInputElement;
      expect(input.value).toBe('0.001');
    });

    it('feedGap defaults to "0.001"', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Feed Gap/i) as HTMLInputElement;
      expect(input.value).toBe('0.001');
    });

    it('segments defaults to "32"', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Segments/i) as HTMLInputElement;
      expect(input.value).toBe('32');
    });

    it('sourceAmplitude defaults to "1"', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Amplitude/i) as HTMLInputElement;
      expect(input.value).toBe('1');
    });

    it('sourcePhase defaults to "0"', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Phase/i) as HTMLInputElement;
      expect(input.value).toBe('0');
    });

    it('position x/y/z default to "0"', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      // Position and orientation both have labeled fields
      const allX = screen.getAllByLabelText('X');
      const allY = screen.getAllByLabelText('Y');
      const allZ = screen.getAllByLabelText('Z');
      // Position fields are first
      expect((allX[0] as HTMLInputElement).value).toBe('0');
      expect((allY[0] as HTMLInputElement).value).toBe('0');
      expect((allZ[0] as HTMLInputElement).value).toBe('0');
    });

    it('orientation rotX/rotY/rotZ default to "0"', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const rotX = screen.getByLabelText(/Rot X/i) as HTMLInputElement;
      const rotY = screen.getByLabelText(/Rot Y/i) as HTMLInputElement;
      const rotZ = screen.getByLabelText(/Rot Z/i) as HTMLInputElement;
      expect(rotX.value).toBe('0');
      expect(rotY.value).toBe('0');
      expect(rotZ.value).toBe('0');
    });
  });

  describe('Form submission resolves all expressions', () => {
    it('radius resolves to ~0.1592m (wavelength/2pi at 300MHz)', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate loop/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const callData = onGenerate.mock.calls[0][0];
      const expectedRadius = C_0 / 300e6 / (2 * Math.PI);
      expect(callData.radius).toBeCloseTo(expectedRadius, 4);
    });

    it('segments resolved to 32 (integer)', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate loop/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].segments).toBe(32);
    });

    it('sourceAmplitude resolved to 1', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate loop/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].sourceAmplitude).toBe(1);
    });

    it('sourcePhase resolved to 0', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate loop/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].sourcePhase).toBe(0);
    });

    it('position resolved to {x: 0, y: 0, z: 0}', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate loop/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('orientation resolved to {rotX: 0, rotY: 0, rotZ: 0}', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate loop/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].orientation).toEqual({
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      });
    });

    it('expressions dict has all expected keys', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate loop/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const callData = onGenerate.mock.calls[0][0];
      expect(callData.expressions).toBeDefined();
      const expectedKeys = [
        'radius',
        'wireRadius',
        'feedGap',
        'segments',
        'sourceAmplitude',
        'sourcePhase',
        'positionX',
        'positionY',
        'positionZ',
        'orientationRotX',
        'orientationRotY',
        'orientationRotZ',
      ];
      for (const key of expectedKeys) {
        expect(callData.expressions).toHaveProperty(key);
      }
      // Verify expression values match defaults
      expect(callData.expressions.radius).toBe('wavelength / (2 * pi)');
      expect(callData.expressions.wireRadius).toBe('0.001');
      expect(callData.expressions.segments).toBe('32');
    });
  });

  describe('Segments rounding', () => {
    it('entering "32.6" results in submitted value 33', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      const input = screen.getByLabelText(/Segments/i);
      await user.clear(input);
      await user.type(input, '32.6');

      await user.click(screen.getByRole('button', { name: /generate loop/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].segments).toBe(33);
    });
  });

  describe('Source type toggle', () => {
    it('default source type is voltage', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const voltageBtn = screen.getByRole('button', { name: /voltage/i });
      expect(voltageBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('can switch to current source', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      const currentBtn = screen.getByRole('button', { name: /current/i });
      await user.click(currentBtn);
      expect(currentBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('unit label changes from V to A when source type switches', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog {...defaultProps} />
        </Provider>
      );
      // Voltage mode — unit shows V
      expect(screen.getByText(/\bV$/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /current/i }));
      // Current mode — unit shows A
      expect(screen.getByText(/\bA$/)).toBeInTheDocument();
    });
  });
});
