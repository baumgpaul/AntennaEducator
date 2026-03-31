/**
 * DipoleDialog Tests — Expression Fields
 * Tests for expression-capable fields, resolution, segments rounding,
 * orientation validation, and expressions dict in submission data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { DipoleDialog } from '../DipoleDialog';

const C_0 = 299792458;

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

describe('DipoleDialog — Expression Fields', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onGenerate: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onGenerate = vi.fn().mockResolvedValue(undefined);
  });

  describe('Default values are expression strings', () => {
    it('length field defaults to "wavelength / 2"', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Total Length/i) as HTMLInputElement;
      expect(input.value).toBe('wavelength / 2');
    });

    it('radius field defaults to "0.001"', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Wire Radius/i) as HTMLInputElement;
      expect(input.value).toBe('0.001');
    });

    it('gap field defaults to "0.001"', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Feed Gap/i) as HTMLInputElement;
      expect(input.value).toBe('0.001');
    });

    it('segments field defaults to "21"', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Segments/i) as HTMLInputElement;
      expect(input.value).toBe('21');
    });

    it('amplitude field defaults to "1"', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Amplitude/i) as HTMLInputElement;
      expect(input.value).toBe('1');
    });

    it('phase field defaults to "0"', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Phase/i) as HTMLInputElement;
      expect(input.value).toBe('0');
    });

    it('position X/Y/Z default to "0", "0", "0"', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      // Position and orientation both have X/Y/Z labels; get all of them
      const allX = screen.getAllByLabelText('X');
      const allY = screen.getAllByLabelText('Y');
      const allZ = screen.getAllByLabelText('Z');
      // Position fields are rendered first
      expect((allX[0] as HTMLInputElement).value).toBe('0');
      expect((allY[0] as HTMLInputElement).value).toBe('0');
      expect((allZ[0] as HTMLInputElement).value).toBe('0');
    });

    it('orientation X/Y/Z default to "0", "0", "1"', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const allX = screen.getAllByLabelText('X');
      const allY = screen.getAllByLabelText('Y');
      const allZ = screen.getAllByLabelText('Z');
      // Orientation fields are rendered second
      expect((allX[1] as HTMLInputElement).value).toBe('0');
      expect((allY[1] as HTMLInputElement).value).toBe('0');
      expect((allZ[1] as HTMLInputElement).value).toBe('1');
    });
  });

  describe('Expression fields accept expressions', () => {
    it('can type "wavelength / 4" in length field', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Total Length/i);
      await user.clear(input);
      await user.type(input, 'wavelength / 4');
      expect((input as HTMLInputElement).value).toBe('wavelength / 4');
    });

    it('can type "2 * pi * 0.001" in radius field', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Wire Radius/i);
      await user.clear(input);
      await user.type(input, '2 * pi * 0.001');
      expect((input as HTMLInputElement).value).toBe('2 * pi * 0.001');
    });

    it('can type an expression in segments field', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Segments/i);
      await user.clear(input);
      await user.type(input, '10 + 11');
      expect((input as HTMLInputElement).value).toBe('10 + 11');
    });
  });

  describe('Form submission resolves expressions', () => {
    it('submit with default values resolves length to ~0.4997m', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate mesh/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const callData = onGenerate.mock.calls[0][0];
      const expectedLength = C_0 / 300e6 / 2;
      expect(callData.length).toBeCloseTo(expectedLength, 4);
    });

    it('submit with default values resolves segments to 21', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate mesh/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const callData = onGenerate.mock.calls[0][0];
      expect(callData.segments).toBe(21);
    });

    it('onGenerate call data has expressions dict with all keys', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate mesh/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const callData = onGenerate.mock.calls[0][0];
      expect(callData.expressions).toBeDefined();
      const expectedKeys = [
        'length',
        'radius',
        'gap',
        'segments',
        'sourceAmplitude',
        'sourcePhase',
        'positionX',
        'positionY',
        'positionZ',
        'orientationX',
        'orientationY',
        'orientationZ',
      ];
      for (const key of expectedKeys) {
        expect(callData.expressions).toHaveProperty(key);
      }
      // Verify expression values match defaults
      expect(callData.expressions.length).toBe('wavelength / 2');
      expect(callData.expressions.radius).toBe('0.001');
      expect(callData.expressions.segments).toBe('21');
    });

    it('resolves numeric values for amplitude, phase, position', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate mesh/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const callData = onGenerate.mock.calls[0][0];
      expect(callData.sourceAmplitude).toBe(1);
      expect(callData.sourcePhase).toBe(0);
      expect(callData.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(callData.orientation).toEqual({ x: 0, y: 0, z: 1 });
    });
  });

  describe('Segments rounding', () => {
    it('entering "21.7" in segments results in submitted value 22', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      const input = screen.getByLabelText(/Segments/i);
      await user.clear(input);
      await user.type(input, '21.7');

      await user.click(screen.getByRole('button', { name: /generate mesh/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].segments).toBe(22);
    });

    it('entering "20.3" in segments results in submitted value 20', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      const input = screen.getByLabelText(/Segments/i);
      await user.clear(input);
      await user.type(input, '20.3');

      await user.click(screen.getByRole('button', { name: /generate mesh/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].segments).toBe(20);
    });
  });

  describe('Orientation validation', () => {
    it('setting all orientation to "0" should NOT call onGenerate', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      // Default orientation is (0, 0, 1) — clear Z to make it all zeros
      const allZ = screen.getAllByLabelText('Z');
      const orientationZ = allZ[1]; // second Z field is orientation
      await user.clear(orientationZ);
      await user.type(orientationZ, '0');

      await user.click(screen.getByRole('button', { name: /generate mesh/i }));

      // Wait a bit to ensure form processing completes
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled();
      });

      expect(onGenerate).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('Position fields', () => {
    it('"Position (meters)" heading is present', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      expect(screen.getByText(/Position \(meters\)/i)).toBeInTheDocument();
    });

    it('Position X/Y/Z fields are rendered with labels', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} />
        </Provider>
      );
      const allX = screen.getAllByLabelText('X');
      const allY = screen.getAllByLabelText('Y');
      const allZ = screen.getAllByLabelText('Z');
      // At least one of each for position (plus orientation)
      expect(allX.length).toBeGreaterThanOrEqual(2);
      expect(allY.length).toBeGreaterThanOrEqual(2);
      expect(allZ.length).toBeGreaterThanOrEqual(2);
    });

    it('can enter expressions in position fields', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      const allX = screen.getAllByLabelText('X');
      const posX = allX[0]; // first X field is position
      await user.clear(posX);
      await user.type(posX, 'wavelength / 4');

      await user.click(screen.getByRole('button', { name: /generate mesh/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const expectedX = C_0 / 300e6 / 4;
      expect(onGenerate.mock.calls[0][0].position.x).toBeCloseTo(expectedX, 4);
    });
  });
});
