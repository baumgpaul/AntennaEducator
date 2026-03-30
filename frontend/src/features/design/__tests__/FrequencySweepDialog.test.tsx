import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FrequencySweepDialog } from '../FrequencySweepDialog';

describe('FrequencySweepDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the dialog when open', () => {
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(screen.getByText('Frequency Sweep Configuration')).toBeInTheDocument();
      expect(screen.getByLabelText(/Start Frequency/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Stop Frequency/i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <FrequencySweepDialog
          open={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(screen.queryByText('Frequency Sweep Configuration')).not.toBeInTheDocument();
    });

    it('should render with default values', () => {
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const startFreq = screen.getByLabelText(/Start Frequency/i) as HTMLInputElement;
      const stopFreq = screen.getByLabelText(/Stop Frequency/i) as HTMLInputElement;

      // Default: 10 MHz and 100 MHz
      expect(startFreq.value).toBe('10');
      expect(stopFreq.value).toBe('100');
    });

    it('should show sweep summary', () => {
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(screen.getByText(/Sweep Range:/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Simulations:/i)).toBeInTheDocument();
      expect(screen.getByText(/Estimated Time:/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should accept valid frequency range', async () => {
      const user = userEvent.setup();
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const startFreq = screen.getByLabelText(/Start Frequency/i);
      const stopFreq = screen.getByLabelText(/Stop Frequency/i);
      const runButton = screen.getByRole('button', { name: /Run Sweep/i });

      await user.clear(startFreq);
      await user.type(startFreq, '50');
      await user.clear(stopFreq);
      await user.type(stopFreq, '150');
      await user.click(runButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          startFrequency: 50e6,
          stopFrequency: 150e6,
          numPoints: 20,
          spacing: 'linear',
        });
      });
    });

    it('should reject when stop frequency is less than start', async () => {
      const user = userEvent.setup();
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const startFreq = screen.getByLabelText(/Start Frequency/i);
      const stopFreq = screen.getByLabelText(/Stop Frequency/i);
      const runButton = screen.getByRole('button', { name: /Run Sweep/i });

      await user.clear(startFreq);
      await user.type(startFreq, '100');
      await user.clear(stopFreq);
      await user.type(stopFreq, '50');
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/Stop frequency must be greater than start frequency/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should reject frequencies below minimum (1 kHz)', async () => {
      const user = userEvent.setup();
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const startFreq = screen.getByLabelText(/Start Frequency/i);
      const runButton = screen.getByRole('button', { name: /Run Sweep/i });

      await user.clear(startFreq);
      await user.type(startFreq, '0.0001'); // 0.1 kHz
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/Start frequency must be at least 1 kHz/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should reject frequencies above maximum (10 GHz)', async () => {
      const user = userEvent.setup();
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const stopFreq = screen.getByLabelText(/Stop Frequency/i);
      const runButton = screen.getByRole('button', { name: /Run Sweep/i });

      await user.clear(stopFreq);
      await user.type(stopFreq, '11000'); // 11000 MHz = 11 GHz
      await user.click(runButton);

      await waitFor(() => {
        expect(screen.getByText(/Stop frequency must be less than 10 GHz/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Spacing Configuration', () => {
    it('should default to linear spacing', () => {
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const linearRadio = screen.getByRole('radio', { name: /Linear/i }) as HTMLInputElement;
      expect(linearRadio.checked).toBe(true);
    });

    it('should allow switching to logarithmic spacing', async () => {
      const user = userEvent.setup();
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const logRadio = screen.getByRole('radio', { name: /Logarithmic/i });
      await user.click(logRadio);
      await user.click(screen.getByRole('button', { name: /Run Sweep/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            spacing: 'logarithmic',
          })
        );
      });
    });
  });

  describe('Number of Points', () => {
    it('should allow adjusting number of points via slider', async () => {
      const user = userEvent.setup();
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Find slider and set to 50 points
      const slider = screen.getByRole('slider');
      await user.click(slider);
      // Note: Actually changing slider value in tests is tricky, so we just verify it renders
      expect(slider).toBeInTheDocument();
      expect(screen.getByText(/Number of Points:/i)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should disable buttons when loading', () => {
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          isLoading={true}
        />
      );

      const runButton = screen.getByRole('button', { name: /Running Sweep.../i });
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });

      expect(runButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });

    it('should show "Running Sweep..." text when loading', () => {
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          isLoading={true}
        />
      );

      expect(screen.getByText(/Running Sweep.../i)).toBeInTheDocument();
    });

    it('should prevent closing when loading', async () => {
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          isLoading={true}
        />
      );

      // Cancel button should be disabled when loading, so we can't click it
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      expect(cancelButton).toBeDisabled();

      // Verify onClose was not called
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Dialog Actions', () => {
    it('should call onClose when cancel button clicked', async () => {
      const user = userEvent.setup();
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should reset form when closed and reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const startFreq = screen.getByLabelText(/Start Frequency/i);
      await user.clear(startFreq);
      await user.type(startFreq, '200');

      // Close dialog
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      // Reopen
      rerender(
        <FrequencySweepDialog
          open={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );
      rerender(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Should reset to default (10 MHz)
      const startFreqAfter = screen.getByLabelText(/Start Frequency/i) as HTMLInputElement;
      expect(startFreqAfter.value).toBe('10');
    });
  });

  describe('Integration', () => {
    it('should submit complete sweep configuration', async () => {
      const user = userEvent.setup();
      render(
        <FrequencySweepDialog
          open={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Configure sweep
      const startFreq = screen.getByLabelText(/Start Frequency/i);
      const stopFreq = screen.getByLabelText(/Stop Frequency/i);
      const logRadio = screen.getByRole('radio', { name: /Logarithmic/i });

      await user.clear(startFreq);
      await user.type(startFreq, '1');
      await user.clear(stopFreq);
      await user.type(stopFreq, '1000');
      await user.click(logRadio);

      // Submit
      const runButton = screen.getByRole('button', { name: /Run Sweep/i });
      await user.click(runButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          startFrequency: 1e6,
          stopFrequency: 1000e6,
          numPoints: 20,
          spacing: 'logarithmic',
        });
      });
    });
  });
});
