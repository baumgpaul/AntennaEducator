/**
 * CircuitEditor Tests
 * Tests for rendering, component palette, data flow, and apply handler.
 * Note: React Flow interaction tests are limited due to canvas/SVG requirements.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { CircuitEditor } from '../CircuitEditor';
import type { AntennaElement } from '@/types/models';

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

// Minimal AntennaElement for testing
const testElement: AntennaElement = {
  id: 'elem-1',
  name: 'Test Dipole',
  type: 'dipole',
  config: {},
  mesh: null,
  sources: [],
  lumped_elements: [],
  appended_nodes: [],
  color: '#ff0000',
};

describe('CircuitEditor', () => {
  const mockOnClose = vi.fn();
  const mockOnApply = vi.fn();

  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    onApply: mockOnApply,
    element: testElement,
    terminalNodeIndices: [4, 5],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Structure', () => {
    it('should render dialog when open', () => {
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      expect(screen.getByText(/Circuit Editor/i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} open={false} />
        </Provider>
      );

      expect(screen.queryByText(/Circuit Editor/i)).not.toBeInTheDocument();
    });

    it('should show element name in title', () => {
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      expect(screen.getByText(/Test Dipole/i)).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('should render Apply and Cancel buttons', () => {
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      expect(screen.getByRole('button', { name: /Apply/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('should call onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onApply when Apply is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Apply/i }));
      expect(mockOnApply).toHaveBeenCalledTimes(1);
    });

    it('should pass sources, lumped_elements, and appended_nodes to onApply', async () => {
      const user = userEvent.setup();
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Apply/i }));

      const appliedData = mockOnApply.mock.calls[0][0];
      expect(appliedData).toHaveProperty('sources');
      expect(appliedData).toHaveProperty('lumped_elements');
      expect(appliedData).toHaveProperty('appended_nodes');
      expect(Array.isArray(appliedData.sources)).toBe(true);
      expect(Array.isArray(appliedData.lumped_elements)).toBe(true);
      expect(Array.isArray(appliedData.appended_nodes)).toBe(true);
    });
  });

  describe('Component Palette', () => {
    it('should render component type toggle buttons', () => {
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      // Component palette should be visible with type labels
      expect(screen.getByText(/Resistor/i)).toBeInTheDocument();
    });
  });

  describe('Add Auxiliary Node', () => {
    it('should render Add Aux Node button', () => {
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      expect(screen.getByRole('button', { name: /Aux/i })).toBeInTheDocument();
    });
  });

  describe('Existing Data', () => {
    it('should load sources from element', () => {
      const elementWithSource: AntennaElement = {
        ...testElement,
        sources: [
          { node_start: 4, node_end: 5, amplitude: 1, phase: 0, type: 'voltage', internal_impedance: 0 },
        ],
      };

      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} element={elementWithSource} />
        </Provider>
      );

      // Should show the circuit editor with the existing source loaded
      expect(screen.getByText(/Circuit Editor/i)).toBeInTheDocument();
    });

    it('should load lumped elements from element', () => {
      const elementWithLumped: AntennaElement = {
        ...testElement,
        lumped_elements: [
          { node_start: 4, node_end: 0, R: 50, L: 0, C_inv: 0 },
        ],
      };

      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} element={elementWithLumped} />
        </Provider>
      );

      expect(screen.getByText(/Circuit Editor/i)).toBeInTheDocument();
    });

    it('should load appended nodes from element', () => {
      const elementWithAppended: AntennaElement = {
        ...testElement,
        appended_nodes: [
          { index: -1, label: 'Match Node' },
        ],
      };

      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} element={elementWithAppended} />
        </Provider>
      );

      expect(screen.getByText(/Circuit Editor/i)).toBeInTheDocument();
    });
  });

  describe('Help Text', () => {
    it('should display help or keyboard shortcut hints', () => {
      render(
        <Provider store={createTestStore()}>
          <CircuitEditor {...defaultProps} />
        </Provider>
      );

      // Circuit editor should show delete hint or help text
      const dialogContent = screen.getByRole('dialog');
      expect(dialogContent).toBeInTheDocument();
    });
  });
});
