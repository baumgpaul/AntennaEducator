/**
 * RodDialog Tests — UI Behaviors
 * Tests for default values, start/end validation, form submission,
 * and geometry field behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { RodDialog } from '../RodDialog';

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

describe('RodDialog — UI Behaviors', () => {
  const mockOnClose = vi.fn();
  const mockOnGenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnGenerate.mockResolvedValue(undefined);
  });

  describe('Dialog Structure', () => {
    it('should render when open', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      expect(screen.getByText('Create Metallic Rod')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={false} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Default Values', () => {
    it('should default start position to (0, 0, 0)', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const startXFields = screen.getAllByLabelText('X');
      const startYFields = screen.getAllByLabelText('Y');
      const startZFields = screen.getAllByLabelText('Z');

      // Start point is first set of X/Y/Z fields
      expect((startXFields[0] as HTMLInputElement).value).toBe('0');
      expect((startYFields[0] as HTMLInputElement).value).toBe('0');
      expect((startZFields[0] as HTMLInputElement).value).toBe('0');
    });

    it('should default end position to (0, 0, 1)', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const xFields = screen.getAllByLabelText('X');
      const yFields = screen.getAllByLabelText('Y');
      const zFields = screen.getAllByLabelText('Z');

      // End point is second set of X/Y/Z fields
      expect((xFields[1] as HTMLInputElement).value).toBe('0');
      expect((yFields[1] as HTMLInputElement).value).toBe('0');
      expect((zFields[1] as HTMLInputElement).value).toBe('1');
    });

    it('should default radius to 0.001', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const radiusInput = screen.getByLabelText(/Radius/i) as HTMLInputElement;
      expect(radiusInput.value).toBe('0.001');
    });

    it('should default segments to 20', () => {
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const segmentsInput = screen.getByLabelText(/Segments/i) as HTMLInputElement;
      expect(segmentsInput.value).toBe('20');
    });
  });

  describe('Form Submission', () => {
    it('should submit with resolved numeric values', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Generate/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      const data = mockOnGenerate.mock.calls[0][0];
      expect(data.start_x).toBe(0);
      expect(data.start_y).toBe(0);
      expect(data.start_z).toBe(0);
      expect(data.end_x).toBe(0);
      expect(data.end_y).toBe(0);
      expect(data.end_z).toBe(1);
      expect(data.radius).toBe(0.001);
      expect(data.segments).toBe(20);
    });

    it('should include expressions dict in submitted data', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Generate/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      const data = mockOnGenerate.mock.calls[0][0];
      expect(data).toHaveProperty('expressions');
    });

    it('should round segments to integer', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const segmentsInput = screen.getByLabelText(/Segments/i);
      await user.clear(segmentsInput);
      await user.type(segmentsInput, '15.7');

      await user.click(screen.getByRole('button', { name: /Generate/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      expect(mockOnGenerate.mock.calls[0][0].segments).toBe(16);
    });
  });

  describe('Start ≠ End Validation', () => {
    it('should reject when start equals end', async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      // Set end to same as start (0,0,0)
      const zFields = screen.getAllByLabelText('Z');
      await user.clear(zFields[1]); // end_z
      await user.type(zFields[1], '0');

      await user.click(screen.getByRole('button', { name: /Generate/i }));

      // Should not call onGenerate (validation fails)
      await waitFor(() => {
        expect(mockOnGenerate).not.toHaveBeenCalled();
      });

      consoleError.mockRestore();
    });

    it('should accept when start and end are different', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      // Default is (0,0,0) to (0,0,1) — already different
      await user.click(screen.getByRole('button', { name: /Generate/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Dialog Actions', () => {
    it('should call onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should close dialog after successful submission', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <RodDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Generate/i }));

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });
  });
});
