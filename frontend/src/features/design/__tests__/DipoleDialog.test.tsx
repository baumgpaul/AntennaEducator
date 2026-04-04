import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { DipoleDialog } from '../DipoleDialog';

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

describe('DipoleDialog - T4.A1: Frequency Input Removal', () => {
  const mockOnClose = vi.fn();
  const mockOnGenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Structure', () => {
    it('should render when open', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      expect(screen.getByText('Dipole Antenna Configuration')).toBeInTheDocument();
      expect(screen.getByText('Design a center-fed dipole antenna')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={false}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      expect(screen.queryByText('Dipole Antenna Configuration')).not.toBeInTheDocument();
    });
  });

  describe('Form Fields - WITHOUT Frequency', () => {
    beforeEach(() => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );
    });

    it('should render antenna name field', () => {
      expect(screen.getByLabelText(/Antenna Name/i)).toBeInTheDocument();
    });

    it('should render geometry parameter fields', () => {
      expect(screen.getByLabelText(/Total Length/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Wire Radius/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Feed Gap/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Segments/i)).toBeInTheDocument();
    });

    it('should NOT render frequency field', () => {
      expect(screen.queryByLabelText(/Design Frequency/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Frequency/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/GHz/i)).not.toBeInTheDocument();
    });

    it('should NOT show wavelength calculation', () => {
      expect(screen.queryByText(/Wavelength:/i)).not.toBeInTheDocument();
    });

    it('should render position and orientation controls', () => {
      // Position fields
      expect(screen.getByText(/Position & Orientation/i)).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate Mesh/i })).toBeInTheDocument();
    });
  });

  describe('Form Validation - WITHOUT Frequency', () => {
    it('should prevent submission with empty name', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const nameInput = screen.getByLabelText(/Antenna Name/i);
      await user.clear(nameInput);

      // Try to submit with empty name
      const generateButton = screen.getByRole('button', { name: /Generate Mesh/i });
      await user.click(generateButton);

      // Should not call onGenerate with invalid data
      expect(mockOnGenerate).not.toHaveBeenCalled();
    });

    it('should accept valid positive length', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const lengthInput = screen.getByLabelText(/Total Length/i);
      await user.clear(lengthInput);
      await user.type(lengthInput, '0.15');

      // Should accept positive value
      expect((lengthInput as HTMLInputElement).value).toBe('0.15');
    });

    it('should accept valid positive radius', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const radiusInput = screen.getByLabelText(/Wire Radius/i);
      await user.clear(radiusInput);
      await user.type(radiusInput, '0.002');

      // Should accept positive value
      expect((radiusInput as HTMLInputElement).value).toBe('0.002');
    });

    it('should accept valid segments count', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const segmentsInput = screen.getByLabelText(/Segments/i);
      await user.clear(segmentsInput);
      await user.type(segmentsInput, '25');

      // Should accept valid segment count
      expect((segmentsInput as HTMLInputElement).value).toBe('25');
    });
  });

  describe('Form Submission - WITHOUT Frequency', () => {
    it('should submit form with valid data excluding frequency', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      // Fill form fields
      const nameInput = screen.getByLabelText(/Antenna Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Test Dipole');

      const lengthInput = screen.getByLabelText(/Total Length/i);
      await user.clear(lengthInput);
      await user.type(lengthInput, '0.15');

      const radiusInput = screen.getByLabelText(/Wire Radius/i);
      await user.clear(radiusInput);
      await user.type(radiusInput, '0.002');

      // Submit form
      const generateButton = screen.getByRole('button', { name: /Generate Mesh/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      // Verify submitted data does NOT include frequency
      const submittedData = mockOnGenerate.mock.calls[0][0];
      expect(submittedData).toHaveProperty('name', 'Test Dipole');
      expect(submittedData).toHaveProperty('length', 0.15);
      expect(submittedData).toHaveProperty('radius', 0.002);
      expect(submittedData).not.toHaveProperty('frequency');
    });

    it('should close dialog after successful submission', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const generateButton = screen.getByRole('button', { name: /Generate Mesh/i });
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
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const generateButton = screen.getByRole('button', { name: /Generate Mesh/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled();
      });

      // Dialog should remain open on error
      expect(mockOnClose).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('Dialog Actions', () => {
    it('should call onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should reset form when dialog closes', async () => {
      const user = userEvent.setup();

      const { rerender } = render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      // Modify form
      const nameInput = screen.getByLabelText(/Antenna Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Modified Name');

      // Close dialog
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      // Reopen dialog
      rerender(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      // Should have default value
      const reopenedNameInput = screen.getByLabelText(/Antenna Name/i) as HTMLInputElement;
      expect(reopenedNameInput.value).toBe('Dipole');
    });
  });

  describe('Default Values', () => {
    it('should have correct default values without frequency', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const nameInput = screen.getByLabelText(/Antenna Name/i) as HTMLInputElement;
      const lengthInput = screen.getByLabelText(/Total Length/i) as HTMLInputElement;
      const radiusInput = screen.getByLabelText(/Wire Radius/i) as HTMLInputElement;
      const gapInput = screen.getByLabelText(/Feed Gap/i) as HTMLInputElement;
      const segmentsInput = screen.getByLabelText(/Segments/i) as HTMLInputElement;

      expect(nameInput.value).toBe('Dipole');
      expect(lengthInput.value).toBe('wavelength / 2');
      expect(radiusInput.value).toBe('0.001');
      expect(gapInput.value).toBe('0.001');
      expect(segmentsInput.value).toBe('21');
    });
  });

  describe('Design Guidelines Section', () => {
    it('should display design guidelines without frequency references', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      expect(screen.getByText(/Design Guidelines:/i)).toBeInTheDocument();
      expect(screen.getByText(/Length ≈ λ\/2 for resonance/i)).toBeInTheDocument();
      expect(screen.getByText(/Radius\/Length ratio/i)).toBeInTheDocument();
      expect(screen.getByText(/15-30 segments/i)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should disable form fields during generation', async () => {
      const user = userEvent.setup();
      let resolveGenerate: () => void;
      mockOnGenerate.mockImplementation(
        () => new Promise((resolve) => { resolveGenerate = resolve as () => void; })
      );

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const generateButton = screen.getByRole('button', { name: /Generate Mesh/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Generating.../i })).toBeInTheDocument();
      });

      // Fields should be disabled
      const nameInput = screen.getByLabelText(/Antenna Name/i);
      expect(nameInput).toBeDisabled();

      // Complete generation
      resolveGenerate!();
    });
  });

  describe('Orientation Presets', () => {
    it('should default to Z-axis orientation', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      // Z-axis button should be active (default orientation is 0,0,1)
      const orientationXFields = screen.getAllByLabelText('X');
      const orientationYFields = screen.getAllByLabelText('Y');
      const orientationZFields = screen.getAllByLabelText('Z');

      // Orientation fields are the second set (first set is position)
      const oriX = orientationXFields[1] as HTMLInputElement;
      const oriY = orientationYFields[1] as HTMLInputElement;
      const oriZ = orientationZFields[1] as HTMLInputElement;

      expect(oriX.value).toBe('0');
      expect(oriY.value).toBe('0');
      expect(oriZ.value).toBe('1');
    });

    it('should set orientation to (1,0,0) when X-axis preset is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /X-axis/i }));

      await waitFor(() => {
        const orientationXFields = screen.getAllByLabelText('X');
        expect((orientationXFields[1] as HTMLInputElement).value).toBe('1');
      });

      const orientationYFields = screen.getAllByLabelText('Y');
      const orientationZFields = screen.getAllByLabelText('Z');
      expect((orientationYFields[1] as HTMLInputElement).value).toBe('0');
      expect((orientationZFields[1] as HTMLInputElement).value).toBe('0');
    });

    it('should set orientation to (0,1,0) when Y-axis preset is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Y-axis/i }));

      await waitFor(() => {
        const orientationYFields = screen.getAllByLabelText('Y');
        expect((orientationYFields[1] as HTMLInputElement).value).toBe('1');
      });
    });

    it('should set orientation to (0,0,1) when Z-axis preset is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      // Click X first to change, then Z to restore
      await user.click(screen.getByRole('button', { name: /X-axis/i }));
      await user.click(screen.getByRole('button', { name: /Z-axis/i }));

      await waitFor(() => {
        const orientationZFields = screen.getAllByLabelText('Z');
        expect((orientationZFields[1] as HTMLInputElement).value).toBe('1');
      });
    });

    it('should submit with correct orientation after preset change', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /X-axis/i }));
      await user.click(screen.getByRole('button', { name: /Generate Mesh/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      const submittedData = mockOnGenerate.mock.calls[0][0];
      expect(submittedData.orientation).toEqual({ x: 1, y: 0, z: 0 });
    });
  });

  describe('Feed Gap Field', () => {
    it('should render feed gap field', () => {
      render(
        <Provider store={createTestStore()}>
          <DipoleDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const gapInput = screen.getByLabelText(/Feed Gap/i) as HTMLInputElement;
      expect(gapInput).toBeInTheDocument();
      expect(gapInput.value).toBe('0.001');
    });

    it('should accept zero gap value', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const gapInput = screen.getByLabelText(/Feed Gap/i);
      await user.clear(gapInput);
      await user.type(gapInput, '0');

      await user.click(screen.getByRole('button', { name: /Generate Mesh/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      expect(mockOnGenerate.mock.calls[0][0].gap).toBe(0);
    });

    it('should submit gap value with form data', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <DipoleDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const gapInput = screen.getByLabelText(/Feed Gap/i);
      await user.clear(gapInput);
      await user.type(gapInput, '0.005');

      await user.click(screen.getByRole('button', { name: /Generate Mesh/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      expect(mockOnGenerate.mock.calls[0][0].gap).toBe(0.005);
    });
  });
});
