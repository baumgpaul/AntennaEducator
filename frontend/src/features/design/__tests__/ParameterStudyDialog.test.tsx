/**
 * Tests for the ParameterStudyDialog component.
 *
 * The dialog lets users configure a parameter sweep of 1–2 variables
 * with min/max/numPoints/spacing for each, plus reference impedance.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { ParameterStudyDialog } from '../ParameterStudyDialog';

// ============================================================================
// Helpers
// ============================================================================

function createTestStore(
  variables = [
    { name: 'freq', expression: '300e6', unit: 'Hz', description: 'Frequency' },
    { name: 'wavelength', expression: 'C_0 / freq', unit: 'm', description: 'Wavelength' },
    { name: 'dipole_length', expression: 'wavelength / 2', unit: 'm', description: 'Dipole length' },
  ],
) {
  return configureStore({
    reducer: { variables: variablesReducer },
    preloadedState: { variables: { variables } },
  });
}

function renderDialog(props: Partial<Parameters<typeof ParameterStudyDialog>[0]> = {}) {
  const store = createTestStore();
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    isLoading: false,
  };
  const merged = { ...defaultProps, ...props };
  return {
    ...render(
      <Provider store={store}>
        <ParameterStudyDialog {...merged} />
      </Provider>,
    ),
    store,
    onClose: merged.onClose,
    onSubmit: merged.onSubmit,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ParameterStudyDialog', () => {
  describe('Dialog Structure', () => {
    it('renders when open', () => {
      renderDialog();
      expect(screen.getByText('Parameter Study')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      renderDialog({ open: false });
      expect(screen.queryByText('Parameter Study')).not.toBeInTheDocument();
    });

    it('shows variable selector for first sweep variable', () => {
      renderDialog();
      // Should have at least one variable dropdown
      expect(screen.getByLabelText(/Variable 1/i)).toBeInTheDocument();
    });

    it('shows min, max, points fields for first variable', () => {
      renderDialog();
      // Min, Max, Points fields
      expect(screen.getByLabelText(/Min/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Max/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Points/)).toBeInTheDocument();
    });

    it('does not show reference impedance field (z0 comes from port)', () => {
      renderDialog();
      expect(screen.queryByLabelText(/Reference Impedance|Z₀/i)).not.toBeInTheDocument();
    });

    it('shows Run button', () => {
      renderDialog();
      expect(screen.getByRole('button', { name: /Run/i })).toBeInTheDocument();
    });

    it('shows Cancel button', () => {
      renderDialog();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });
  });

  describe('Variable Selection', () => {
    it('lists available variables in dropdown', async () => {
      const user = userEvent.setup();
      renderDialog();
      // Open the Variable 1 dropdown (MUI Select)
      const select = screen.getByLabelText(/Variable 1/i);
      await user.click(select);
      // Should see freq, wavelength, dipole_length in the listbox
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /freq/i })).toBeInTheDocument();
      });
    });
  });

  describe('Actions', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const { onClose } = renderDialog();
      await user.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Grid Preview', () => {
    it('shows total points count in the alert', () => {
      renderDialog();
      // With default freq variable selected, fallback min/max make config valid → 11 points
      expect(screen.getByText(/11 simulation points/i)).toBeInTheDocument();
    });
  });
});
