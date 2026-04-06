/**
 * ComponentEditDialog Tests
 * Tests for component type selection, value validation, node pair constraints,
 * expression resolution, and save handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import variablesReducer from '@/store/variablesSlice';
import { ComponentEditDialog } from '../ComponentEditDialog';
import type { CircuitNode, CircuitComponent } from '@/types/circuitTypes';

function createTestStore() {
  return configureStore({
    reducer: {
      variables: variablesReducer,
    },
  });
}

const testNodes: CircuitNode[] = [
  { index: 0, kind: 'ground', label: 'GND', positionX: 0, positionY: 0 },
  { index: 1, kind: 'terminal', label: 'Feed 1', positionX: 100, positionY: 0 },
  { index: 2, kind: 'terminal', label: 'Feed 2', positionX: 200, positionY: 0 },
  { index: -1, kind: 'appended', label: 'Aux 1', positionX: 150, positionY: 100 },
];

describe('ComponentEditDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    onSave: mockOnSave,
    nodes: testNodes,
    editComponent: null as CircuitComponent | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dialog Structure', () => {
    it('should render "Add Component" title for new component', () => {
      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      expect(screen.getByText('Add Component')).toBeInTheDocument();
    });

    it('should render "Edit Component" title when editing existing', () => {
      const existing: CircuitComponent = {
        id: 'comp-1',
        type: 'resistor',
        nodeA: 1,
        nodeB: 2,
        value: 100,
        phase: 0,
        label: 'R1',
      };

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} editComponent={existing} />
        </Provider>
      );

      expect(screen.getByText('Edit Component')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} open={false} />
        </Provider>
      );

      expect(screen.queryByText('Add Component')).not.toBeInTheDocument();
    });
  });

  describe('Component Type Selection', () => {
    it('should default to resistor type', () => {
      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      // The default component type should be resistor — default value field shows Ω unit
      expect(screen.getByLabelText(/Value \(Ω\)/i)).toBeInTheDocument();
    });

    it('should show value field', () => {
      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      expect(screen.getByLabelText(/Value \(/)).toBeInTheDocument();
    });
  });

  describe('Value Validation', () => {
    it('should reject zero value for passive components', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      const valueInput = screen.getByLabelText(/Value \(/);
      await user.clear(valueInput);
      await user.type(valueInput, '0');

      await user.click(screen.getByRole('button', { name: /^Add$/i }));

      // Should show error, not call onSave
      expect(mockOnSave).not.toHaveBeenCalled();
      expect(screen.getByText(/must be positive/i)).toBeInTheDocument();
    });

    it('should reject negative value for passive components', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      const valueInput = screen.getByLabelText(/Value \(/);
      await user.clear(valueInput);
      await user.type(valueInput, '-50');

      await user.click(screen.getByRole('button', { name: /^Add$/i }));

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should accept positive value for resistor', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      const valueInput = screen.getByLabelText(/Value \(/);
      await user.clear(valueInput);
      await user.type(valueInput, '100');

      await user.click(screen.getByRole('button', { name: /^Add$/i }));

      expect(mockOnSave).toHaveBeenCalledTimes(1);
      expect(mockOnSave.mock.calls[0][0]).toMatchObject({
        type: 'resistor',
        value: 100,
      });
    });
  });

  describe('Node Pair Constraints', () => {
    it('should reject when Node A equals Node B', async () => {
      const user = userEvent.setup();

      // Only GND node — nodeA defaults to 0, nodeB defaults to 0
      const gndOnly: CircuitNode[] = [
        { index: 0, kind: 'ground', label: 'GND', positionX: 0, positionY: 0 },
      ];

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} nodes={gndOnly} />
        </Provider>
      );

      const valueInput = screen.getByLabelText(/Value \(/);
      await user.clear(valueInput);
      await user.type(valueInput, '100');

      await user.click(screen.getByRole('button', { name: /^Add$/i }));

      // Both default to 0 (GND) — validation rejects
      expect(mockOnSave).not.toHaveBeenCalled();
      expect(screen.getByText(/must be different/i)).toBeInTheDocument();
    });
  });

  describe('Save Data Format', () => {
    it('should save resistor with correct format', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      const valueInput = screen.getByLabelText(/Value \(/);
      await user.clear(valueInput);
      await user.type(valueInput, '75');

      await user.click(screen.getByRole('button', { name: /^Add$/i }));

      expect(mockOnSave).toHaveBeenCalledTimes(1);
      const saved = mockOnSave.mock.calls[0][0];
      expect(saved.type).toBe('resistor');
      expect(saved.value).toBe(75);
      expect(saved.phase).toBe(0);
    });

    it('should preserve id when editing existing component', async () => {
      const user = userEvent.setup();
      const existing: CircuitComponent = {
        id: 'comp-existing',
        type: 'resistor',
        nodeA: 1,
        nodeB: 2,
        value: 100,
        phase: 0,
        label: 'R1',
      };

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} editComponent={existing} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Update/i }));

      expect(mockOnSave).toHaveBeenCalledTimes(1);
      expect(mockOnSave.mock.calls[0][0].id).toBe('comp-existing');
    });
  });

  describe('Dialog Actions', () => {
    it('should call onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      await user.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should close dialog after successful save', async () => {
      const user = userEvent.setup();

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} />
        </Provider>
      );

      const valueInput = screen.getByLabelText(/Value \(/);
      await user.clear(valueInput);
      await user.type(valueInput, '100');

      await user.click(screen.getByRole('button', { name: /^Add$/i }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edit Mode', () => {
    it('should populate fields from existing component', () => {
      const existing: CircuitComponent = {
        id: 'comp-1',
        type: 'inductor',
        nodeA: 1,
        nodeB: -1,
        value: 0.001,
        phase: 0,
        label: 'L1',
      };

      render(
        <Provider store={createTestStore()}>
          <ComponentEditDialog {...defaultProps} editComponent={existing} />
        </Provider>
      );

      const valueInput = screen.getByLabelText(/Value \(/) as HTMLInputElement;
      expect(valueInput.value).toBe('0.001');
    });
  });
});
