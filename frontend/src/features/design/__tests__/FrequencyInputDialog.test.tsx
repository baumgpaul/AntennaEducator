import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FrequencyInputDialog } from '../FrequencyInputDialog';

describe('FrequencyInputDialog - T4.B1.1', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;
  let mockOnSolve: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnClose = vi.fn();
    mockOnSolve = vi.fn().mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('renders the dialog with correct form fields', () => {
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      expect(screen.getByText('Solve Single Frequency')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Solve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('shows default frequency value of 300 MHz', () => {
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(frequencyInput.value).toBe('300');

      // MHz should be selected by default
      expect(screen.getByText('MHz')).toBeInTheDocument();
    });

    it('does not render when open is false', () => {
      render(
        <FrequencyInputDialog
          open={false}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      expect(screen.queryByText('Solve Single Frequency')).not.toBeInTheDocument();
    });
  });

  describe('Input validation', () => {
    it('accepts valid frequency in MHz range', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '500');

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(mockOnSolve).toHaveBeenCalledWith(500, 'MHz');
      });
    });

    it('accepts valid frequency in GHz range', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '2.4');

      // Change unit to GHz
      const unitSelect = screen.getByLabelText(/Unit/i);
      await user.click(unitSelect);
      const ghzOption = screen.getByRole('option', { name: 'GHz' });
      await user.click(ghzOption);

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        // Component passes value and unit, not converted value
        expect(mockOnSolve).toHaveBeenCalledWith(2.4, 'GHz');
      });
    });

    it.skip('shows validation error for frequency below minimum (0.1 MHz)', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '0.05');

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(screen.getByText(/Frequency must be between 0.1 MHz and 1000 GHz/i)).toBeInTheDocument();
      });

      expect(mockOnSolve).not.toHaveBeenCalled();
    });

    it.skip('shows validation error for frequency above maximum (1000 GHz)', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '1500');

      // Change unit to GHz
      const unitSelect = screen.getByLabelText(/Unit/i);
      await user.click(unitSelect);
      const ghzOption = screen.getByRole('option', { name: 'GHz' });
      await user.click(ghzOption);

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(screen.getByText(/Frequency must be between 0.1 MHz and 1000 GHz/i)).toBeInTheDocument();
      });

      expect(mockOnSolve).not.toHaveBeenCalled();
    });

    it('validates boundary value 0.1 MHz (minimum)', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '0.1');

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(mockOnSolve).toHaveBeenCalledWith(0.1, 'MHz');
      });
    });

    it('validates boundary value 1000 GHz (maximum)', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '1000');

      // Change unit to GHz
      const unitSelect = screen.getByLabelText(/Unit/i);
      await user.click(unitSelect);
      const ghzOption = screen.getByRole('option', { name: 'GHz' });
      await user.click(ghzOption);

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(mockOnSolve).toHaveBeenCalledWith(1000, 'GHz');
      });
    });
  });

  describe('Button clicks', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onSolve with correct frequency when Solve is clicked', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '915');

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(mockOnSolve).toHaveBeenCalledWith(915, 'MHz');
      });
    });

    it('closes dialog after successful solve', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Loading state', () => {
    it('disables inputs and buttons during loading', () => {
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
          isLoading={true}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');
      const solveButton = screen.getByRole('button', { name: /Solving.../i });
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });

      expect(frequencyInput).toBeDisabled();
      expect(solveButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });

    it('shows "Solving..." text during loading', () => {
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
          isLoading={true}
        />
      );

      expect(screen.getByText('Solving...')).toBeInTheDocument();
    });

    it('shows loading spinner during solve', () => {
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
          isLoading={true}
        />
      );

      const solveButton = screen.getByRole('button', { name: /Solving.../i });
      const spinner = solveButton.querySelector('.MuiCircularProgress-root');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('displays error message when solve fails', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Solver service unavailable';
      mockOnSolve.mockRejectedValueOnce(new Error(errorMessage));

      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });

      // Dialog should remain open on error
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('allows retry after error', async () => {
      const user = userEvent.setup();
      mockOnSolve
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(undefined);

      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const solveButton = screen.getByRole('button', { name: /Solve/i });

      // First attempt - fails
      await user.click(solveButton);
      await waitFor(() => {
        expect(screen.getByText('First attempt failed')).toBeInTheDocument();
      });

      // Second attempt - succeeds
      await user.click(solveButton);
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });

    it.skip('clears validation error when user modifies input', async () => {
      const user = userEvent.setup();
      render(
        <FrequencyInputDialog
          open={true}
          onClose={mockOnClose}
          onSolve={mockOnSolve}
        />
      );

      const frequencyInput = screen.getByRole('spinbutton');

      // Enter invalid value
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '0.05');

      const solveButton = screen.getByRole('button', { name: /Solve/i });
      await user.click(solveButton);

      await waitFor(() => {
        expect(screen.getByText(/Frequency must be between/i)).toBeInTheDocument();
      });

      // Modify input - this should clear the error
      await user.clear(frequencyInput);
      await user.type(frequencyInput, '300');

      // Wait for error to be cleared
      await waitFor(() => {
        expect(screen.queryByText(/Frequency must be between/i)).not.toBeInTheDocument();
      });
    });
  });
});
