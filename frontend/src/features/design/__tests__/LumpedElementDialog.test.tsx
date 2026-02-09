import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LumpedElementDialog } from '../LumpedElementDialog';
import { AntennaElement, Mesh } from '@/types/models';

describe('LumpedElementDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnAdd = vi.fn().mockResolvedValue(undefined);

  const mockMesh: Mesh = {
    nodes: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
    radii: [0.001, 0.001, 0.001, 0.001],
  };

  const mockElements: AntennaElement[] = [
    {
      id: '1',
      name: 'Dipole 1',
      type: 'dipole',
      config: {
        length: 1,
        wire_radius: 0.001,
      },
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      mesh: mockMesh,
      visible: true,
      locked: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the dialog when open', () => {
    render(
      <LumpedElementDialog
        open={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={10}
        elements={mockElements}
      />
    );

    expect(screen.getByText('Add Lumped Element')).toBeInTheDocument();
    expect(screen.getByLabelText(/Element Type/i)).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(
      <LumpedElementDialog
        open={false}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={10}
        elements={mockElements}
      />
    );

    expect(screen.queryByText('Add Lumped Element')).not.toBeInTheDocument();
  });


  it('should show resistance field for resistor type', async () => {
    render(
      <LumpedElementDialog
        open={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={10}
        elements={mockElements}
      />
    );

    // Resistor should be default
    expect(screen.getByLabelText(/Resistance/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Inductance/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Capacitance/i)).not.toBeInTheDocument();
  });

  it('should show inductance field when L type selected', async () => {
    const user = userEvent.setup();
    render(
      <LumpedElementDialog
        open={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={10}
        elements={mockElements}
      />
    );

    // Change to inductor
    const typeSelect = screen.getByLabelText(/Element Type/i);
    await user.click(typeSelect);
    const inductorOption = screen.getByRole('option', { name: 'L - Inductor' });
    await user.click(inductorOption);

    // Should show inductance field
    expect(screen.getByLabelText(/Inductance/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Resistance/i)).not.toBeInTheDocument();
  });

  it('should show capacitance field when C type selected', async () => {
    const user = userEvent.setup();
    render(
      <LumpedElementDialog
        open={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={10}
        elements={mockElements}
      />
    );

    // Change to capacitor
    const typeSelect = screen.getByLabelText(/Element Type/i);
    await user.click(typeSelect);
    const capacitorOption = screen.getByRole('option', { name: 'C - Capacitor' });
    await user.click(capacitorOption);

    // Should show capacitance field
    expect(screen.getByLabelText(/Inverse Capacitance/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Resistance/i)).not.toBeInTheDocument();
  });


  it('should call onAdd with correct data when form submitted', async () => {
    const user = userEvent.setup();
    render(
      <LumpedElementDialog
        open={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={10}
        elements={mockElements}
      />
    );

    // Fill in the form
    const resistanceInput = screen.getByLabelText(/Resistance/i);
    await user.clear(resistanceInput);
    await user.type(resistanceInput, '75');

    const node1Input = screen.getByLabelText('Node 1');
    await user.clear(node1Input);
    await user.type(node1Input, '2');

    const node2Input = screen.getByLabelText('Node 2');
    await user.clear(node2Input);
    await user.type(node2Input, '3');

    // Submit the form
    const addButton = screen.getByRole('button', { name: /Add Element/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(mockOnAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          element_type: 'R',
          resistance: 75,
          node1: 2,
          node2: 3,
          antennaId: '1',
        })
      );
    });
  });

  it('should validate that nodes are different', async () => {
    const user = userEvent.setup();
    render(
      <LumpedElementDialog
        open={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={10}
        elements={mockElements}
      />
    );

    // Set same node for both
    const node1Input = screen.getByLabelText('Node 1');
    await user.clear(node1Input);
    await user.type(node1Input, '5');

    const node2Input = screen.getByLabelText('Node 2');
    await user.clear(node2Input);
    await user.type(node2Input, '5');

    // Try to submit
    const addButton = screen.getByRole('button', { name: /Add Element/i });
    await user.click(addButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/Node1 and Node2 must be different/i)).toBeInTheDocument();
    });

    // Should not call onAdd
    expect(mockOnAdd).not.toHaveBeenCalled();
  });

  it('should disable add button when maxNodeIndex is 0', () => {
    render(
      <LumpedElementDialog
        open={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={0}
        elements={mockElements}
      />
    );

    const addButton = screen.getByRole('button', { name: /Add Element/i });
    expect(addButton).toBeDisabled();
    expect(screen.getByText(/No antenna mesh loaded/i)).toBeInTheDocument();
  });

  it('should call onClose when cancel button clicked', async () => {
    const user = userEvent.setup();
    render(
      <LumpedElementDialog
        open={true}
        onClose={mockOnClose}
        onAdd={mockOnAdd}
        maxNodeIndex={10}
        elements={mockElements}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
