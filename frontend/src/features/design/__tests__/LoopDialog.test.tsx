import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { LoopDialog } from '../LoopDialog';

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

describe('LoopDialog - T4.A2: Frequency Input Removal', () => {
  const mockOnClose = vi.fn();
  const mockOnGenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Structure', () => {
    it('should render when open', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      expect(screen.getByText(/Configure Loop Antenna/i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog
            open={false}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      expect(screen.queryByText(/Loop Antenna Configuration/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Fields - WITHOUT Frequency', () => {
    beforeEach(() => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog
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

    it('should render loop geometry fields for circular loop', () => {
      expect(screen.getByLabelText(/Loop Radius/i)).toBeInTheDocument();
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
        <Provider store={createTestStore()}>
          <LoopDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
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
      expect(submittedData).toHaveProperty('radius');
      expect(submittedData).not.toHaveProperty('frequency');
    });

    it('should close dialog after successful submission', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <LoopDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
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
      userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      // Component is for circular loops — verify radius field exists
      const radiusField = screen.getByLabelText(/Loop Radius/i);
      expect(radiusField).toBeInTheDocument();
    });
  });

  describe('Dialog Actions', () => {
    it('should call onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <LoopDialog
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
  });

  describe('Default Values', () => {
    it('should have correct default values without frequency', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog
            open={true}
            onClose={mockOnClose}
            onGenerate={mockOnGenerate}
          />
        </Provider>
      );

      const nameInput = screen.getByLabelText(/Antenna Name/i) as HTMLInputElement;

      // Name should default to 'Loop'
      expect(nameInput).toBeInTheDocument();
      expect(nameInput.value).toBe('Loop');
      // Circular loop radius should be present
      expect(screen.getByLabelText(/Loop Radius/i)).toBeInTheDocument();
    });
  });

  describe('Orientation (Rotation Angles)', () => {
    it('should render rotation angle fields', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      expect(screen.getByLabelText(/Rot X/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Rot Y/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Rot Z/i)).toBeInTheDocument();
    });

    it('should default rotation angles to 0', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      expect((screen.getByLabelText(/Rot X/i) as HTMLInputElement).value).toBe('0');
      expect((screen.getByLabelText(/Rot Y/i) as HTMLInputElement).value).toBe('0');
      expect((screen.getByLabelText(/Rot Z/i) as HTMLInputElement).value).toBe('0');
    });

    it('should accept rotation angle values', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <LoopDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const rotX = screen.getByLabelText(/Rot X/i);
      await user.clear(rotX);
      await user.type(rotX, '45');

      expect((rotX as HTMLInputElement).value).toBe('45');
    });

    it('should submit with rotation angles in resolved data', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <LoopDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const rotX = screen.getByLabelText(/Rot X/i);
      await user.clear(rotX);
      await user.type(rotX, '90');

      await user.click(screen.getByRole('button', { name: /Generate/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      const submittedData = mockOnGenerate.mock.calls[0][0];
      expect(submittedData.orientation).toEqual({ rotX: 90, rotY: 0, rotZ: 0 });
    });

    it('should submit rotation angles without normalization', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <LoopDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      const rotX = screen.getByLabelText(/Rot X/i);
      const rotY = screen.getByLabelText(/Rot Y/i);
      const rotZ = screen.getByLabelText(/Rot Z/i);

      await user.clear(rotX);
      await user.type(rotX, '30');
      await user.clear(rotY);
      await user.type(rotY, '60');
      await user.clear(rotZ);
      await user.type(rotZ, '-45');

      await user.click(screen.getByRole('button', { name: /Generate/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      const submittedData = mockOnGenerate.mock.calls[0][0];
      // Euler angles passed as-is (no normalization)
      expect(submittedData.orientation.rotX).toBe(30);
      expect(submittedData.orientation.rotY).toBe(60);
      expect(submittedData.orientation.rotZ).toBe(-45);
    });
  });

  describe('Feed Gap', () => {
    it('should render feed gap field', () => {
      render(
        <Provider store={createTestStore()}>
          <LoopDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      expect(screen.getByLabelText(/Feed Gap/i)).toBeInTheDocument();
    });

    it('should include feedGap in submitted data', async () => {
      const user = userEvent.setup();
      mockOnGenerate.mockResolvedValue(undefined);

      render(
        <Provider store={createTestStore()}>
          <LoopDialog open={true} onClose={mockOnClose} onGenerate={mockOnGenerate} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Generate/i }));

      await waitFor(() => {
        expect(mockOnGenerate).toHaveBeenCalledTimes(1);
      });

      expect(mockOnGenerate.mock.calls[0][0]).toHaveProperty('feedGap');
    });
  });
});
