import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddFieldDialog } from '../AddFieldDialog';

describe('AddFieldDialog - T4.B1.2', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;
  let mockOnCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnClose = vi.fn();
    mockOnCreate = vi.fn();
  });

  describe('Rendering', () => {
    it('renders the dialog with stepper', () => {
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      expect(screen.getByText('Add Field Region')).toBeInTheDocument();
      expect(screen.getByText('Region Type')).toBeInTheDocument();
      expect(screen.getByText('Shape')).toBeInTheDocument();
      expect(screen.getByText('Parameters')).toBeInTheDocument();
      expect(screen.getByText('Field Types')).toBeInTheDocument();
    });

    it('starts at step 1 (Region Type)', () => {
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      expect(screen.getByText('2D Region')).toBeInTheDocument();
      expect(screen.getByText('3D Region')).toBeInTheDocument();
    });
  });

  describe('Step Navigation', () => {
    it('allows moving to next step', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      await user.click(nextButton);

      // Should be on step 2 now
      expect(screen.getByLabelText(/Shape/i)).toBeInTheDocument();
    });

    it('allows moving back to previous step', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Go to step 2
      const nextButton = screen.getByRole('button', { name: /Next/i });
      await user.click(nextButton);

      // Go back to step 1
      const backButton = screen.getByRole('button', { name: /Back/i });
      await user.click(backButton);

      expect(screen.getByText('2D Region')).toBeInTheDocument();
    });

    it('disables Back button on first step', () => {
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      const backButton = screen.getByRole('button', { name: /Back/i });
      expect(backButton).toBeDisabled();
    });

    it('shows Create button on last step', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to last step
      const nextButton = screen.getByRole('button', { name: /Next/i });
      await user.click(nextButton); // Step 2
      await user.click(nextButton); // Step 3
      await user.click(nextButton); // Step 4
      await user.click(nextButton); // Step 5

      expect(screen.getByRole('button', { name: /Create/i })).toBeInTheDocument();
    });
  });

  describe('Step 1: Region Type Selection', () => {
    it('allows selecting 2D region', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      const twoDCard = screen.getByText('2D Region').closest('button');
      await user.click(twoDCard!);

      // Verify selection by checking if we can proceed
      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).not.toBeDisabled();
    });

    it('allows selecting 3D region', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      const threeDCard = screen.getByText('3D Region').closest('button');
      await user.click(threeDCard!);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe('Step 2: Shape Selection', () => {
    it.skip('shows 2D shapes when 2D region is selected', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Select 2D and go to step 2
      await user.click(screen.getByText('2D Region').closest('button')!);
      await user.click(screen.getByRole('button', { name: /Next/i }));

      // Open the Shape select dropdown by clicking the combobox
      const shapeSelect = screen.getByRole('combobox', { name: /Shape/i });
      await user.click(shapeSelect);

      // MUI Select renders options in a portal, wait for them to appear
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Rectangular Plane/i })).toBeInTheDocument();
      });
      expect(screen.getByRole('option', { name: /Circle/i })).toBeInTheDocument();
    });

    it.skip('shows 3D shapes when 3D region is selected', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Select 3D and go to step 2
      await user.click(screen.getByText('3D Region').closest('button')!);
      await user.click(screen.getByRole('button', { name: /Next/i }));

      // Open the Shape select dropdown by clicking the combobox
      const shapeSelect = screen.getByRole('combobox', { name: /Shape/i });
      await user.click(shapeSelect);

      // MUI Select renders options in a portal, wait for them to appear
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Sphere/i })).toBeInTheDocument();
      });
      expect(screen.getByRole('option', { name: /Cube/i })).toBeInTheDocument();
    });
  });

  describe('Step 3: Parameters', () => {
    it('shows center point inputs', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3

      expect(screen.getByLabelText(/X \(mm\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Y \(mm\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Z \(mm\)/i)).toBeInTheDocument();
    });

    it('shows appropriate dimension inputs for plane', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 3 (default is 2D plane)
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3

      // Check that dimension fields are present
      await waitFor(() => {
        expect(screen.getByLabelText(/Width \(mm\)/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Height \(mm\)/i)).toBeInTheDocument();
      });
    });

    it('shows sampling inputs for 2D region', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3

      expect(screen.getByLabelText(/Points in X/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Points in Y/i)).toBeInTheDocument();
    });
  });

  describe('Step 4: Field Types', () => {
    it('shows all field type checkboxes', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 4
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 4

      expect(screen.getByLabelText(/E-field/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/H-field/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Poynting/i)).toBeInTheDocument();
    });

    it('E-field is checked by default', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 4
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 4

      const eFieldCheckbox = screen.getByLabelText(/E-field/i) as HTMLInputElement;
      expect(eFieldCheckbox.checked).toBe(true);
    });

    it('disables Next if no field types selected', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 4
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 4

      // Uncheck the default E-field
      const eFieldCheckbox = screen.getByLabelText(/E-field/i);
      await user.click(eFieldCheckbox);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Step 5: Near/Far Field', () => {
    it('shows near and far field options', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 5
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 4
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 5

      expect(screen.getByLabelText(/Near field/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Far field/i)).toBeInTheDocument();
    });

    it('near field is selected by default', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 5
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 4
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 5

      const nearFieldRadio = screen.getByLabelText(/Near field/i) as HTMLInputElement;
      expect(nearFieldRadio.checked).toBe(true);
    });
  });

  describe('Field Creation', () => {
    it('calls onCreate with field definition when Create is clicked', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate through all steps
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 4
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 5

      // Click Create
      const createButton = screen.getByRole('button', { name: /Create/i });
      await user.click(createButton);

      expect(mockOnCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: '2D',
          shape: 'plane',
          centerPoint: [0, 0, 50],
          farField: false,
          fieldType: 'E',
        })
      );
    });

    it('closes dialog after successful creation', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to end and create
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 4
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 5
      await user.click(screen.getByRole('button', { name: /Create/i }));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('resets state after creation', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate and create
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 4
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 5
      await user.click(screen.getByRole('button', { name: /Create/i }));

      // Reopen dialog
      rerender(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Should be back at step 1
      expect(screen.getByText('2D Region')).toBeInTheDocument();
    });
  });

  describe('Cancel Button', () => {
    it('closes dialog when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('resets state when dialog is cancelled', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Navigate to step 3
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 2
      await user.click(screen.getByRole('button', { name: /Next/i })); // Step 3

      // Cancel
      await user.click(screen.getByRole('button', { name: /Cancel/i }));

      // Reopen
      rerender(<AddFieldDialog open={true} onClose={mockOnClose} onCreate={mockOnCreate} />);

      // Should be back at step 1
      expect(screen.getByText('2D Region')).toBeInTheDocument();
    });
  });
});
