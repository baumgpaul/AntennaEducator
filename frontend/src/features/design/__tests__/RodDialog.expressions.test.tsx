/**
 * RodDialog Tests — Expression Fields
 * Tests for expression-capable fields, resolution, segments rounding,
 * start==end validation, rod length display, and expressions dict.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { RodDialog } from '../RodDialog';

const C_0 = 299792458;

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

describe('RodDialog — Expression Fields', () => {
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
    it('start_x/y/z default to "0", "0", "0"', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} />
        </Provider>
      );
      // Start Point section has X/Y/Z fields, then End Point has X/Y/Z
      const allX = screen.getAllByLabelText('X');
      const allY = screen.getAllByLabelText('Y');
      const allZ = screen.getAllByLabelText('Z');
      expect((allX[0] as HTMLInputElement).value).toBe('0');
      expect((allY[0] as HTMLInputElement).value).toBe('0');
      expect((allZ[0] as HTMLInputElement).value).toBe('0');
    });

    it('end_x/y/z default to "0", "0", "1"', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} />
        </Provider>
      );
      const allX = screen.getAllByLabelText('X');
      const allY = screen.getAllByLabelText('Y');
      const allZ = screen.getAllByLabelText('Z');
      // End point fields are the second set
      expect((allX[1] as HTMLInputElement).value).toBe('0');
      expect((allY[1] as HTMLInputElement).value).toBe('0');
      expect((allZ[1] as HTMLInputElement).value).toBe('1');
    });

    it('radius defaults to "0.001"', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Wire Radius/i) as HTMLInputElement;
      expect(input.value).toBe('0.001');
    });

    it('segments defaults to "20"', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} />
        </Provider>
      );
      const input = screen.getByLabelText(/Number of Segments/i) as HTMLInputElement;
      expect(input.value).toBe('20');
    });
  });

  describe('Form submission resolves expressions', () => {
    it('submit with defaults: start=[0,0,0], end=[0,0,1], radius=0.001, segments=20', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate rod/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const callData = onGenerate.mock.calls[0][0];
      expect(callData.start_x).toBe(0);
      expect(callData.start_y).toBe(0);
      expect(callData.start_z).toBe(0);
      expect(callData.end_x).toBe(0);
      expect(callData.end_y).toBe(0);
      expect(callData.end_z).toBe(1);
      expect(callData.radius).toBe(0.001);
      expect(callData.segments).toBe(20);
    });

    it('expressions dict has all expected keys', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /generate rod/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const callData = onGenerate.mock.calls[0][0];
      expect(callData.expressions).toBeDefined();
      const expectedKeys = [
        'start_x',
        'start_y',
        'start_z',
        'end_x',
        'end_y',
        'end_z',
        'radius',
        'segments',
      ];
      for (const key of expectedKeys) {
        expect(callData.expressions).toHaveProperty(key);
      }
      expect(callData.expressions.end_z).toBe('1');
      expect(callData.expressions.radius).toBe('0.001');
      expect(callData.expressions.segments).toBe('20');
    });
  });

  describe('Expression in coordinates', () => {
    it('can type "wavelength / 4" in end_z field and submit resolves to numeric', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      const allZ = screen.getAllByLabelText('Z');
      const endZ = allZ[1]; // second Z is end point
      await user.clear(endZ);
      await user.type(endZ, 'wavelength / 4');

      await user.click(screen.getByRole('button', { name: /generate rod/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      const expectedZ = C_0 / 300e6 / 4;
      expect(onGenerate.mock.calls[0][0].end_z).toBeCloseTo(expectedZ, 4);
    });
  });

  describe('Segments rounding', () => {
    it('entering "20.5" results in submitted value 21', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      const input = screen.getByLabelText(/Number of Segments/i);
      await user.clear(input);
      await user.type(input, '20.5');

      await user.click(screen.getByRole('button', { name: /generate rod/i }));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledTimes(1);
      });

      expect(onGenerate.mock.calls[0][0].segments).toBe(21);
    });
  });

  describe('Start == End validation', () => {
    it('set end_z to "0" (same as start) → submit should NOT call onGenerate', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} onGenerate={onGenerate} />
        </Provider>
      );

      const allZ = screen.getAllByLabelText('Z');
      const endZ = allZ[1]; // second Z is end point
      await user.clear(endZ);
      await user.type(endZ, '0');

      await user.click(screen.getByRole('button', { name: /generate rod/i }));

      // The error is thrown and caught, so onGenerate may be called but
      // the start==end validation throws before onGenerate, so it should not be called
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled();
      });

      expect(onGenerate).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('Rod length display', () => {
    it('default shows calculated length ~1.0000 m', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog {...defaultProps} />
        </Provider>
      );
      // The Alert shows "Calculated Length: 1.0000 m"
      expect(screen.getByText(/1\.0000 m/)).toBeInTheDocument();
    });
  });
});
