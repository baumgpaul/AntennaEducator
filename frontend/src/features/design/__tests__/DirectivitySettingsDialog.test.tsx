import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DirectivitySettingsDialog from '../DirectivitySettingsDialog';

describe('DirectivitySettingsDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default settings', () => {
    render(
      <DirectivitySettingsDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    expect(screen.getByText('Directivity Pattern Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Theta Points (Elevation)')).toHaveValue(19);
    expect(screen.getByLabelText('Phi Points (Azimuth)')).toHaveValue(37);
    // Check total sample points (text split across elements)
    const strongElements = screen.getAllByText(/Total sample points:/);
    // The number is in the parent element (Typography component)
    const hasCorrectTotal = strongElements.some(el => {
      const text = el.parentElement?.textContent || '';
      return text.includes('703');
    });
    expect(hasCorrectTotal).toBe(true);
  });

  it('renders with custom initial settings', () => {
    render(
      <DirectivitySettingsDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        initialSettings={{ theta_points: 30, phi_points: 60 }}
      />
    );

    expect(screen.getByLabelText('Theta Points (Elevation)')).toHaveValue(30);
    expect(screen.getByLabelText('Phi Points (Azimuth)')).toHaveValue(60);
    // Check total sample points (text split across elements)
    const strongElements = screen.getAllByText(/Total sample points:/);
    const hasCorrectTotal = strongElements.some(el => {
      const text = el.parentElement?.textContent || '';
      return text.includes('1800');
    });
    expect(hasCorrectTotal).toBe(true);
  });

  it('validates theta points range', async () => {
    render(
      <DirectivitySettingsDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const thetaInput = screen.getByLabelText('Theta Points (Elevation)');
    
    // Test below minimum
    fireEvent.change(thetaInput, { target: { value: '3' } });
    await waitFor(() => {
      expect(screen.getByText('Must be between 5 and 180')).toBeInTheDocument();
    });
    expect(screen.getByText('Add Directivity')).toBeDisabled();

    // Test above maximum
    fireEvent.change(thetaInput, { target: { value: '200' } });
    await waitFor(() => {
      expect(screen.getByText('Must be between 5 and 180')).toBeInTheDocument();
    });

    // Test valid value
    fireEvent.change(thetaInput, { target: { value: '50' } });
    await waitFor(() => {
      expect(screen.queryByText('Must be between 5 and 180')).not.toBeInTheDocument();
    });
  });

  it('validates phi points range', async () => {
    render(
      <DirectivitySettingsDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const phiInput = screen.getByLabelText('Phi Points (Azimuth)');
    
    // Test below minimum
    fireEvent.change(phiInput, { target: { value: '2' } });
    await waitFor(() => {
      expect(screen.getByText('Must be between 5 and 360')).toBeInTheDocument();
    });

    // Test above maximum
    fireEvent.change(phiInput, { target: { value: '400' } });
    await waitFor(() => {
      expect(screen.getByText('Must be between 5 and 360')).toBeInTheDocument();
    });

    // Test valid value
    fireEvent.change(phiInput, { target: { value: '100' } });
    await waitFor(() => {
      expect(screen.queryByText('Must be between 5 and 360')).not.toBeInTheDocument();
    });
  });

  it('calls onConfirm with valid settings', async () => {
    render(
      <DirectivitySettingsDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const thetaInput = screen.getByLabelText('Theta Points (Elevation)');
    const phiInput = screen.getByLabelText('Phi Points (Azimuth)');

    fireEvent.change(thetaInput, { target: { value: '25' } });
    fireEvent.change(phiInput, { target: { value: '50' } });

    const confirmButton = screen.getByText('Add Directivity');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith({
        theta_points: 25,
        phi_points: 50,
      });
    });
  });

  it('resets values on cancel', async () => {
    render(
      <DirectivitySettingsDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        initialSettings={{ theta_points: 20, phi_points: 40 }}
      />
    );

    const thetaInput = screen.getByLabelText('Theta Points (Elevation)');
    fireEvent.change(thetaInput, { target: { value: '100' } });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('does not call onConfirm with invalid settings', () => {
    render(
      <DirectivitySettingsDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const thetaInput = screen.getByLabelText('Theta Points (Elevation)');
    fireEvent.change(thetaInput, { target: { value: '3' } });

    const confirmButton = screen.getByText('Add Directivity');
    expect(confirmButton).toBeDisabled();
    
    fireEvent.click(confirmButton);
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it('updates total sample points dynamically', async () => {
    render(
      <DirectivitySettingsDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    );

    const thetaInput = screen.getByLabelText('Theta Points (Elevation)');
    const phiInput = screen.getByLabelText('Phi Points (Azimuth)');

    fireEvent.change(thetaInput, { target: { value: '10' } });
    fireEvent.change(phiInput, { target: { value: '20' } });

    // Check total sample points updates (text split across elements)
    await waitFor(() => {
      const strongElements = screen.getAllByText(/Total sample points:/);
      const hasCorrectTotal = strongElements.some(el => {
        const text = el.parentElement?.textContent || '';
        return text.includes('200');
      });
      expect(hasCorrectTotal).toBe(true);
    });
  });
});
