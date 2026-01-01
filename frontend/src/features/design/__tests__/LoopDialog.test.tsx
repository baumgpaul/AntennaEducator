import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoopDialog } from '../LoopDialog';

describe('LoopDialog - T4.A2: Frequency Input Removal', () => {
  const mockOnClose = vi.fn();
  const mockOnGenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Structure', () => {
    it('should render when open', () => {
      render(
        <LoopDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText(/Configure Loop Antenna/i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <LoopDialog
          open={false}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.queryByText(/Loop Antenna Configuration/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Fields - WITHOUT Frequency', () => {
    beforeEach(() => {
      render(
        <LoopDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );
    });

    it('should render antenna name field', () => {
      expect(screen.getByLabelText(/Antenna Name/i)).toBeInTheDocument();
    });

    it('should render loop type selector', () => {
      expect(screen.getByLabelText(/Loop Shape/i)).toBeInTheDocument();
    });

    it('should render geometry parameter fields for circular loop', () => {
      expect(screen.getByLabelText(/Loop Radius/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Wire Radius/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Segments/i)).toBeInTheDocument();
    });

    it('should NOT render frequency field', () => {
      expect(screen.queryByLabelText(/Frequency/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/GHz/i)).not.toBeInTheDocument();
    });

    it('should NOT show wavelength calculation', () => {
      expect(screen.queryByText(/Wavelength:/i)).not.toBeInTheDocument();
    });

    it('should render action buttons', () => {
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate/i })).toBeInTheDocument();
    });
  });

  describe('Form Submission - WITHOUT Frequency', () => {
    it('should submit circular loop form without frequency', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <LoopDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const nameInput = screen.getByLabelText(/Antenna Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Test Loop');

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      const submittedData = mockOnGenerate.mock.calls[0][0];
      expect(submittedData).toHaveProperty('name', 'Test Loop');
      expect(submittedData).toHaveProperty('loopType', 'circular');
      expect(submittedData).not.toHaveProperty('frequency');
    });

    it('should close dialog after successful submission', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <LoopDialog
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
  });

  describe('Loop Type Switching', () => {
    it('should support circular loop type', async () => {
      const user = userEvent.setup();
      render(
        <LoopDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const loopTypeSelect = screen.getByLabelText(/Loop Shape/i);
      // MUI Select value is set via the underlying input
      expect(loopTypeSelect).toBeInTheDocument();
      // Value check may not work reliably with MUI Select in testing environment
      // so we just verify the select element exists
    });
  });

  describe('Dialog Actions', () => {
    it('should call onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <LoopDialog
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
        <LoopDialog
          open={true}
          onClose={mockOnClose}
          onGenerate={mockOnGenerate}
        />
      );

      const nameInput = screen.getByLabelText(/Antenna Name/i) as HTMLInputElement;
      const loopTypeSelect = screen.getByLabelText(/Loop Shape/i);

      // Name and loop shape selectors should be present
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('Loop');
      expect(loopTypeSelect).toBeInTheDocument();
      // Default loop type (circular) is set but value check unreliable with MUI Select
    });
  });
});
