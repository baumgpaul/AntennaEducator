import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelixDialog } from '../HelixDialog';

describe('HelixDialog - T4.A3: Frequency Input Removal', () => {
  const mockOnClose = vi.fn();
  const mockOnGenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Structure', () => {
    it('should render when open', () => {
      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText(/Create Helical Antenna/i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <HelixDialog
          open={false}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.queryByText(/Create Helical Antenna/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Fields - WITHOUT Frequency', () => {
    beforeEach(() => {
      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );
    });

    it('should render helix geometry fields', () => {
      expect(screen.getByLabelText(/Diameter/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pitch/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Turns/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Wire Radius/i)).toBeInTheDocument();
    });

    it('should render helix mode selector', () => {
      expect(screen.getByLabelText(/Helix Mode/i)).toBeInTheDocument();
    });

    it('should render polarization selector', () => {
      expect(screen.getByLabelText(/Polarization/i)).toBeInTheDocument();
    });

    it('should NOT render frequency field', () => {
      expect(screen.queryByLabelText(/^Frequency$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Frequency \(GHz\)/i)).not.toBeInTheDocument();
    });

    it('should NOT show wavelength calculation', () => {
      expect(screen.queryByText(/Wavelength:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Wavelength.*λ/i)).not.toBeInTheDocument();
    });

    it('should render action buttons', () => {
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate/i })).toBeInTheDocument();
    });
  });

  describe('Form Submission - WITHOUT Frequency', () => {
    it('should submit form with valid data excluding frequency', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const diameterInput = screen.getByLabelText(/Diameter/i);
      await user.clear(diameterInput);
      await user.type(diameterInput, '0.15');

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      const submittedData = mockOnGenerate.mock.calls[0][0];
      expect(submittedData).toHaveProperty('diameter');
      expect(submittedData).toHaveProperty('pitch');
      expect(submittedData).toHaveProperty('turns');
      expect(submittedData).not.toHaveProperty('frequency');
    });

    it('should close dialog after successful submission', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle generation errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockOnGenerate.mockRejectedValue(new Error('Generation failed'));

      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled();
      });

      expect(mockOnClose).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('Dialog Actions', () => {
    it('should call onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Default Values', () => {
    it('should have correct default values without frequency', () => {
      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const diameterInput = screen.getByLabelText(/Diameter/i) as HTMLInputElement;
      const pitchInput = screen.getByLabelText(/Pitch/i) as HTMLInputElement;
      const turnsInput = screen.getByLabelText(/Turns/i) as HTMLInputElement;

      expect(diameterInput.value).toBe('0.1');
      expect(pitchInput.value).toBe('0.05');
      expect(turnsInput.value).toBe('5');
    });
  });

  describe('Helix Configuration', () => {
    it('should support helix mode selection', () => {
      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const helixModeSelect = screen.getByLabelText(/Helix Mode/i);
      expect(helixModeSelect).toBeInTheDocument();
    });

    it('should support polarization selection', () => {
      render(
        <HelixDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const polarizationSelect = screen.getByLabelText(/Polarization/i);
      expect(polarizationSelect).toBeInTheDocument();
    });
  });
});
